// init data
let nodesPerId = {};
let prevRisFilter;

// init force graph
const Graph = ForceGraph3D()
  (document.getElementById('viz'))
  .nodeLabel(node => `AS${node.id}`)
  .nodeColor(node => ({
      origin: 'red',
      collector: 'blue',
      peer: null
    }[node.type]))
  .linkDirectionalParticles(2)
  .linkWidth(link => link.latest ? 4 : 0)
  .dagMode('lr')
  .dagLevelDistance(70);

// init websocket
const ws = new WebSocket("wss://ris-live.ripe.net/v1/ws/?client=vasco-ris-live-viz");
ws.onmessage = message => {
  const risMsg = JSON.parse(message.data).data;
  processRisMessage(risMsg);
  // console.log(risMsg);
};

// init controls
const controls = { ASN: 13335 };
const gui = new dat.GUI();
gui.add(controls, 'ASN').onChange(startViz);

// kick-start with default AS
ws.onopen = () => startViz(controls.ASN);

//

function genData () {
  const nodes = [];
  const links = [];

  Object.values(nodesPerId).forEach(node => {
    nodes.push(node);
    for (let nb of node.upNeighbors) {
      links.push({ source: node.id, target: nb, latest: node.lastNeighbors.has(nb) })
    }
  });

  return { nodes, links };
}

function startViz(asn) {
  if (prevRisFilter) {
    // unsubscribe from previous AS
    ws.send(JSON.stringify({ type: "ris_unsubscribe", data: prevRisFilter }));
  }

  prevRisFilter = { path: asn }; // rrc: 0

  ws.send(JSON.stringify({
    type: "ris_subscribe",
    data: prevRisFilter
  }));

  // reset data assynchronously
  setTimeout(() => {
    nodesPerId = {
      [asn]: { id: asn, upNeighbors: new Set(), lastNeighbors: new Set(), type: 'origin' },
      12654: { id: 12654, upNeighbors: new Set(), type: 'collector' }
    };

    Graph.graphData(genData());
  }, 100);
}

function processRisMessage(risMsg) {
  if (risMsg.hasOwnProperty('announcements')) {
    // wipe last path updates
    Object.values(nodesPerId).forEach(node => node.lastNeighbors = new Set());

    let prevNode = nodesPerId[12654];
    risMsg.path.forEach(asn => {
      if (!nodesPerId[asn]) {
        nodesPerId[asn] = { id: asn, upNeighbors: new Set(), lastNeighbors: new Set(), type: 'peer' };
      }

      const node = nodesPerId[asn];

      // if (node.id === prevNode.id || prevNode.upNeighbors.has(node.id)) return; // exclude prepending and short loops
      if (isAncestorOf(prevNode, node.id)) return; // exclude prepending and loops

      node.upNeighbors.add(prevNode.id);
      node.lastNeighbors.add(prevNode.id);
      prevNode = node;
    });

    Graph.graphData(genData());
  }

  //

  function isAncestorOf(node, id) {
    return (
      node.id === id
      || node.upNeighbors.has(id)
      || [...node.upNeighbors].some(nb => isAncestorOf(nodesPerId[nb], id))
    );
  }
}
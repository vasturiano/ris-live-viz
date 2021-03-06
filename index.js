// init data
let nodesPerId = {};
let prevRisFilter;

// init force graph
const Graph = ForceGraph3D()
  (document.getElementById('viz'))
  .nodeRelSize(5)
  .nodeLabel(node => `AS${node.id}`)
  .nodeColor(node => ({
      origin: 'crimson',
      collector: 'steelblue',
      peer: null
    }[node.type]))
  .linkDirectionalParticles(2)
  .linkWidth(link => link.latest ? 4 : 0)
  .dagMode('lr')
  .dagLevelDistance(75)
  .linkCurvature(-0.07)
  .d3AlphaDecay(0.04)
  .d3VelocityDecay(0.5);

  // custom node
  const sphereGeometry = new THREE.SphereGeometry(Graph.nodeRelSize(), 8, 8);
  const sphereMaterials = {
    origin: new THREE.MeshPhongMaterial({ color: 'crimson', depthWrite: false,  transparent: true, opacity: 0.8 }),
    collector: new THREE.MeshPhongMaterial({ color: 'steelblue', depthWrite: false,  transparent: true, opacity: 0.8 }),
    peer: new THREE.MeshPhongMaterial({ color: '#ffffaa', depthWrite: false,  transparent: true, opacity: 0.8 })
  };
  Graph.nodeThreeObject(node => {
    const obj = new THREE.Mesh(sphereGeometry, sphereMaterials[node.type]);

    // add text sprite as child
    const sprite = new SpriteText(`AS${node.id}`);
    sprite.color = node.type === 'peer' ? '#111' : '#eee';
    sprite.textHeight = 2;
    obj.add(sprite);
    return obj;
  });

  // Add collision force
  Graph.d3Force('collide', d3.forceCollide(Graph.nodeRelSize()));

  // Spread nodes a little wider
  Graph.d3Force('charge').strength(-70);

// init websocket
const ws = new WebSocket("wss://ris-live.ripe.net/v1/ws/?client=vasco-ris-live-viz");
ws.onmessage = message => {
  const risMsg = JSON.parse(message.data).data;
  processRisMessage(risMsg);
  // console.log(risMsg);
};

// init controls
const controls = { ASN: 13335, Update: true };
const gui = new dat.GUI();
gui.add(controls, 'ASN').onChange(startViz);
// gui.add(controls, 'Update');

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

const updGraph = _.throttle(() => Graph.graphData(genData()), 1500);

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

    updGraph();
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

    if (controls.Update) {
      updGraph();
    }
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
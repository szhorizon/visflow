/**
 * @fileOverview Provides helper functions for dataflow modification.
 * The helper functions here should only be imported by the dataflow store.
 */
import { VueConstructor } from 'vue';
import _ from 'lodash';

import { checkEdgeConnectivity } from '@/store/dataflow/util';
import { showSystemMessage } from '@/common/util';
import { Node, NodeSave } from '@/components/node';
import Edge, { EdgeSave } from '@/components/edge/edge';
import Port from '@/components/port/port';
import store from '@/store';
import {
  DataflowState,
  CreateNodeOptions,
  DiagramSave,
  CreateNodeData,
} from '@/store/dataflow/types';
import { getConstructor } from '@/store/dataflow/node-types';
import { propagateNode, propagateNodes, propagatePort } from '@/store/dataflow/propagate';
import { getInitialState } from '@/store/dataflow';
import { InputPort, OutputPort } from '@/components/port';
import DataflowCanvas from '@/components/dataflow-canvas/dataflow-canvas';
export * from '@/store/dataflow/propagate';

const dataflow = (): DataflowState => store.state.dataflow;

const getCanvas = (): DataflowCanvas => {
  if (!dataflow().canvas) {
    console.error('getCanvas() called with undefined canvas');
  }
  return dataflow().canvas as DataflowCanvas;
};

const getNodeDataOnCreate = (options: CreateNodeOptions): CreateNodeData => {
  const data: CreateNodeData = {};
  if (options.dataflowX !== undefined && options.dataflowY !== undefined) {
    data.dataflowX = options.dataflowX;
    data.dataflowY = options.dataflowY;
  } else if (options.dataflowCenterX !== undefined && options.dataflowCenterY !== undefined) {
    data.dataflowCenterX = options.dataflowCenterX;
    data.dataflowCenterY = options.dataflowCenterY;
  }
  return data;
};

const assignNodeId = (state: DataflowState): string => {
  const nodeIds = new Set(state.nodes.map(node => node.id));
  for (let id = 1;; id++) {
    const newId = `node-${id}`;
    if (!nodeIds.has(newId)) {
      return newId;
    }
  }
};

export const createNode = (state: DataflowState, options: CreateNodeOptions, nodeSave?: object): Node => {
  const constructor = getConstructor(options.type) as VueConstructor;
  const id = assignNodeId(state);
  const dataOnCreate = getNodeDataOnCreate(options);
  const node: Node = new constructor({
    data: {
      id,
      dataOnCreate,
      ...(nodeSave || {}),
    },
    store,
  }) as Node;

  if (node.nodeType !== options.type) {
    console.error(`NODE_TYPE not set on node ${options.type}`);
  }

  getCanvas().addNode(node);
  state.nodes.push(node);
  if (options.activate) {
    node.activate();
    node.select();
  }
  return node;
};

/**
 * Creates a new node X on an edge going from port a to b, and replace the connection (a, b) by
 * (a, X) and (X, b). Note that (a, X) and (X, b) may not always be connectable, so the newly created edges may contain
 * zero, one, or two edges.
 */
export const insertNodeOnEdge = (state: DataflowState, node: Node, edge: Edge):
  { createdEdges: Edge[], removedEdge: Edge } => {
  const edgeSource = edge.source;
  const edgeTarget = edge.target;
  // Removes the existing edge first to avoid connectiviy check failing because of existing connection.
  removeEdge(state, edge, false);
  const nodeOutputPort = node.findConnectablePort(edgeTarget) as OutputPort;
  const result: { createdEdges: Edge[], removedEdge: Edge } = {
    createdEdges: [],
    removedEdge: edge,
  };
  let e1: Edge | null = null;
  let e2: Edge | null = null;
  if (nodeOutputPort) {
    e1 = createEdgeToNode(state, edge.source, node, false, { disableMessage: true });
    e2 = createEdge(state, nodeOutputPort, edgeTarget, false, { disableMessage: true });
    result.createdEdges = [e1, e2].filter(e => e !== null) as Edge[];
  }
  if (e1) {
    propagatePort(edgeSource);
  }
  if (e2 && !e1) {
    propagateNode(node);
  }
  return result;
};

export const createEdge = (state: DataflowState, sourcePort: OutputPort, targetPort: InputPort,
                           propagate: boolean, options?: { disableMessage: boolean }): Edge | null => {
  const connectivity = checkEdgeConnectivity(sourcePort, targetPort);
  if (!connectivity.connectable) {
    if (!(options && options.disableMessage)) {
      showSystemMessage(store, connectivity.reason, 'warn');
    }
    return null;
  }
  const edge = new Edge({
    data: {
      // always create edge from output port to input port
      source: !sourcePort.isInput ? sourcePort : targetPort,
      target: !sourcePort.isInput ? targetPort : sourcePort,
    },
    store,
  });
  sourcePort.addIncidentEdge(edge);
  targetPort.addIncidentEdge(edge);
  getCanvas().addEdge(edge);
  if (propagate) {
    propagateNode(edge.target.node);
  }
  return edge;
};

export const createEdgeToNode = (state: DataflowState, sourcePort: OutputPort, targetNode: Node,
                                 propagate: boolean, options?: { disableMessage: boolean }): Edge | null => {
  const targetPort = targetNode.findConnectablePort(sourcePort) as InputPort;
  if (!targetPort) {
    if (!(options && options.disableMessage)) {
      showSystemMessage(store, 'cannot find available port to connect', 'warn');
    }
    return null;
  }
  return createEdge(state, sourcePort, targetPort, propagate);
};

export const removeEdge = (state: DataflowState, edge: Edge, propagate: boolean) => {
  edge.source.removeIncidentEdge(edge);
  edge.target.removeIncidentEdge(edge);

  if (propagate) {
    propagateNode(edge.target.node);
  }

  getCanvas().removeEdge(edge, () => edge.$destroy());
};


export const removeNode = (state: DataflowState, node: Node, propagate: boolean): { removedEdges: Edge[] } => {
  const outputNodes = node.getOutputNodes();
  const edgesToRemove = node.getAllEdges();
  for (const edge of edgesToRemove) {
    removeEdge(state, edge, false);
  }
  if (propagate) {
    propagateNodes(outputNodes);
  }

  _.pull(state.nodes, node);
  getCanvas().removeNode(node, () => node.$destroy());
  return { removedEdges: edgesToRemove };
};

// Returns removed nodes and edges.
export const removeSelectedNodes = (state: DataflowState): { removedNodes: Node[], removedEdges: Edge[] } => {
  const affectedOutputNodes: Set<Node> = new Set();
  const nodes = state.nodes.filter(node => node.isSelected);
  for (const node of nodes) {
    for (const toNode of node.getOutputNodes()) {
      if (_.indexOf(nodes, toNode) === -1) {
        affectedOutputNodes.add(toNode);
      }
    }
  }
  let removedEdges: Edge[] = [];
  for (const node of nodes) {
    removedEdges = removedEdges.concat(removeNode(state, node, false).removedEdges);
  }
  propagateNodes(Array.from(affectedOutputNodes));
  return {
    removedNodes: nodes,
    removedEdges,
  };
};

export const disconnectPort = (state: DataflowState, port: Port, propagate: boolean): Edge[] => {
  const affectedNodes = port.isInput ? [port.node] : port.getConnectedNodes();
  const removedEdges = port.getAllEdges();
  for (const edge of removedEdges) {
    removeEdge(state, edge, false);
  }
  if (propagate) {
    propagateNodes(affectedNodes);
  }
  return removedEdges;
};

export const resetDataflow = (state: DataflowState) => {
  for (const node of _.clone(state.nodes)) { // Make a clone to avoid mutating a list currently being traversed.
    removeNode(state, node, false);
  }
  _.extend(state, _.omit(getInitialState(), 'canvas'));
  store.commit('history/clear');
};

export const serializeDiagram = (state: DataflowState): DiagramSave => {
  const serializedEdges: EdgeSave[] = [];
  for (const node of state.nodes) {
    const edges = node.getOutputEdges();
    for (const edge of edges) {
      serializedEdges.push(edge.serialize());
    }
  }
  return {
    diagramName: state.diagramName,
    nodes: state.nodes.map(node => node.serialize()),
    edges: serializedEdges,
  };
};

export const deserializeDiagram = (state: DataflowState, diagram: DiagramSave) => {
  // First clear the diagram.
  resetDataflow(state);

  // Turn on deserializing flag to avoid nodes trigger propagation.
  state.isDeserializing = true;

  const sources = diagram.nodes.map(nodeSave => {
    const node = createNode(
      state,
      { type: nodeSave.type },
      nodeSave,
    );
    node.deserialize(nodeSave);
    node.deactivate(); // Avoid all nodes being active.
    return node;
  }).filter(node => node.isPropagationSource);

  state.numNodeLayers = _.max(diagram.nodes.map(node => node.layer)) || 0;

  for (const edgeSave of diagram.edges) {
    const sourceNode = state.nodes.find(node => node.id === edgeSave.sourceNodeId) as Node;
    const targetNode = state.nodes.find(node => node.id === edgeSave.targetNodeId) as Node;
    const sourcePort = sourceNode.getOutputPort(edgeSave.sourcePortId);
    const targetPort = targetNode.getInputPort(edgeSave.targetPortId);
    createEdge(state, sourcePort, targetPort, false);
  }

  state.isDeserializing = false;
  propagateNodes(sources);
};

// tslint:disable no-any

import Node from '@/components/node/node';
import { DiagramEventType } from '@/store/dataflow/types';

export enum HistoryEventLevel {
  DIAGRAM = 'diagram',
  NODE = 'node',
  INTERACTION = 'interaction',
}

export type HistoryEventIcon = { isNodeIcon: true, nodeType: string } | { isNodeIcon?: false, value: string };

export interface HistoryEvent {
  level: HistoryEventLevel;
  type: string;
  message: string;
  data: any;
  icon?: HistoryEventIcon;
}

export interface HistoryNodeEvent extends HistoryEvent {
  level: HistoryEventLevel.NODE;
  node: Node;
}

export interface HistoryInteractionEvent extends HistoryEvent {
  level: HistoryEventLevel.INTERACTION;
}

/**
 * An event that sets an option value for a node. The settings typically happens in the node's option panel.
 * Undoing this event calls setter(prevValue).
 * Redoing this event calls setter(value).
 */
export interface HistoryNodeOptionEvent extends HistoryNodeEvent {
  setter: (value: any) => void;
  data: {
    value: any;
    prevValue: any;
  };
}

export interface HistoryDiagramEvent extends HistoryEvent {
  level: HistoryEventLevel.DIAGRAM;
  type: DiagramEventType;
}

// Batch event that creates/removes multiple nodes/edges
export interface HistoryDiagramBatchEvent extends HistoryEvent {
  level: HistoryEventLevel.DIAGRAM;
  events: HistoryDiagramEvent[];
}

export interface HistoryState {
  undoStack: HistoryEvent[];
  redoStack: HistoryEvent[];
}

export * from './util';

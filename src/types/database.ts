export type DataType = 'INTEGER' | 'STRING' | 'BOOLEAN' | 'FLOAT' | 'DATE';

export interface ColumnDefinition {
  name: string;
  type: DataType;
  primaryKey?: boolean;
  unique?: boolean;
  nullable?: boolean;
  defaultValue?: any;
}

export interface TableSchema {
  name: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
}

export interface IndexDefinition {
  name: string;
  column: string;
  type: 'BTREE' | 'HASH';
}

export interface RowData {
  [column: string]: any;
}

export interface QueryResult {
  success: boolean;
  data?: RowData[];
  message?: string;
  executionTime?: number;
  rowsAffected?: number;
}

export interface JoinCondition {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  operator: '=' | '!=' | '<' | '>' | '<=' | '>=';
}
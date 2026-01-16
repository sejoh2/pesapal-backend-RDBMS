import { DataType } from '../../types/database';

export class Column {
  constructor(
    public name: string,
    public type: DataType,
    public primaryKey: boolean = false,
    public unique: boolean = false,
    public nullable: boolean = true,
    public defaultValue: any = null
  ) {}

  validate(value: any): boolean {
    if (value === null || value === undefined) {
      return this.nullable;
    }

    switch (this.type) {
      case 'INTEGER':
        return Number.isInteger(Number(value));
      case 'FLOAT':
        return !isNaN(Number(value));
      case 'STRING':
        return typeof value === 'string';
      case 'BOOLEAN':
        return typeof value === 'boolean' || 
               value === 'true' || value === 'false' ||
               value === 0 || value === 1;
      case 'DATE':
        return !isNaN(Date.parse(value)) || value instanceof Date;
      default:
        return false;
    }
  }

  serialize(value: any): any {
    if (value === null || value === undefined) return null;
    
    switch (this.type) {
      case 'INTEGER':
        return parseInt(value);
      case 'FLOAT':
        return parseFloat(value);
      case 'BOOLEAN':
        return Boolean(value);
      case 'STRING':
        return String(value);
      case 'DATE':
        return new Date(value).toISOString();
      default:
        return value;
    }
  }
}
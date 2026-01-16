import { Column } from './Column';
import { RowData } from '../../types/database';

export class Table {
  private rows: RowData[] = [];
  private indexes: Map<string, Map<any, number[]>> = new Map();
  private onChange?: () => void;

  constructor(
    public name: string,
    public columns: Column[],
    private primaryKeyColumn?: string,
    onChange?: () => void
  ) {
    this.onChange = onChange;
    this.createIndexes();
  }

  private createIndexes(): void {
    this.columns.forEach(column => {
      if (column.primaryKey || column.unique) {
        this.indexes.set(column.name, new Map());
      }
    });
  }

  private updateIndex(columnName: string, value: any, rowIndex: number): void {
    const index = this.indexes.get(columnName);
    if (index) {
      if (!index.has(value)) {
        index.set(value, []);
      }
      const indices = index.get(value)!;
      if (!indices.includes(rowIndex)) {
        indices.push(rowIndex);
      }
    }
  }

  private removeFromIndex(columnName: string, value: any, rowIndex: number): void {
    const index = this.indexes.get(columnName);
    if (index) {
      const indices = index.get(value);
      if (indices) {
        const updatedIndices = indices.filter(i => i !== rowIndex);
        if (updatedIndices.length === 0) {
          index.delete(value);
        } else {
          index.set(value, updatedIndices);
        }
      }
    }
  }

  // Notify database of changes
  private notifyChange(): void {
    if (this.onChange) {
      this.onChange();
    }
  }

  validateRow(data: RowData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate each column
    this.columns.forEach(column => {
      const value = data[column.name];
      
      // Check if required column is present
      if (!column.nullable && (value === undefined || value === null)) {
        errors.push(`Column '${column.name}' is required`);
        return;
      }

      // If value is provided, validate it
      if (value !== undefined && value !== null) {
        if (!column.validate(value)) {
          errors.push(`Invalid value for column '${column.name}'. Expected ${column.type}, got ${typeof value}`);
        }
      }

      // Check unique constraint
      if (column.unique && value !== undefined && value !== null) {
        const existing = this.findByIndex(column.name, value);
        if (existing.length > 0) {
          // Check if it's the same row (for updates)
          const isSameRow = existing.every(row => 
            Object.keys(data).some(key => data[key] !== row[key])
          );
          if (!isSameRow) {
            errors.push(`Duplicate value for unique column '${column.name}': ${value}`);
          }
        }
      }
    });

    return { valid: errors.length === 0, errors };
  }

  insert(data: RowData): { success: boolean; row?: RowData; errors?: string[] } {
    const validation = this.validateRow(data);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    // Create new row with serialized values
    const row: RowData = {};
    this.columns.forEach(column => {
      const value = data[column.name] !== undefined ? column.serialize(data[column.name]) : column.defaultValue;
      row[column.name] = value;
    });

    // Insert row
    const rowIndex = this.rows.length;
    this.rows.push(row);

    // Update indexes
    this.columns.forEach(column => {
      if (column.primaryKey || column.unique) {
        this.updateIndex(column.name, row[column.name], rowIndex);
      }
    });

    // Notify database to save
    this.notifyChange();

    return { success: true, row: { ...row } };
  }

  select(where?: (row: RowData) => boolean): RowData[] {
    if (!where) {
      return this.rows.map(row => ({ ...row }));
    }
    
    return this.rows.filter(where).map(row => ({ ...row }));
  }

  update(
    updates: Partial<RowData>,
    where?: (row: RowData) => boolean
  ): { success: boolean; rowsAffected: number; errors?: string[] } {
    let affected = 0;
    const errors: string[] = [];

    // First, find all rows that match the WHERE condition
    const rowsToUpdate: { index: number; row: RowData }[] = [];
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (!where || where(row)) {
        rowsToUpdate.push({ index: i, row: { ...row } });
      }
    }

    // Process each row to update
    for (const { index, row } of rowsToUpdate) {
      // Create the updated row
      const updatedRow: RowData = { ...row };
      Object.keys(updates).forEach(key => {
        const column = this.columns.find(c => c.name === key);
        if (column && updates[key] !== undefined) {
          updatedRow[key] = column.serialize(updates[key]);
        }
      });

      // Validate the updated row
      const validation = this.validateRow(updatedRow);
      if (!validation.valid) {
        errors.push(`Row at index ${index}: ${validation.errors.join(', ')}`);
        continue;
      }

      // Check if any indexed column value changed
      const changedIndexedColumns: Array<{name: string, oldValue: any, newValue: any}> = [];
      this.columns.forEach(column => {
        if ((column.primaryKey || column.unique) && row[column.name] !== updatedRow[column.name]) {
          changedIndexedColumns.push({
            name: column.name,
            oldValue: row[column.name],
            newValue: updatedRow[column.name]
          });
        }
      });

      // Remove old index entries for changed columns
      changedIndexedColumns.forEach(({ name, oldValue }) => {
        this.removeFromIndex(name, oldValue, index);
      });

      // Update the row
      this.rows[index] = updatedRow;

      // Add new index entries for changed columns
      changedIndexedColumns.forEach(({ name, newValue }) => {
        this.updateIndex(name, newValue, index);
      });

      affected++;
    }

    // Notify database to save if changes were made
    if (affected > 0) {
      this.notifyChange();
    }

    return { 
      success: errors.length === 0, 
      rowsAffected: affected, 
      errors: errors.length > 0 ? errors : undefined 
    };
  }

  delete(where?: (row: RowData) => boolean): { success: boolean; rowsAffected: number } {
    const indicesToDelete: number[] = [];
    
    // Find rows to delete
    for (let i = 0; i < this.rows.length; i++) {
      if (!where || where(this.rows[i])) {
        indicesToDelete.push(i);
      }
    }

    // Sort in descending order for safe deletion
    indicesToDelete.sort((a, b) => b - a);

    // Delete rows
    indicesToDelete.forEach(index => {
      const row = this.rows[index];
      
      // Remove from indexes
      this.columns.forEach(column => {
        if (column.primaryKey || column.unique) {
          this.removeFromIndex(column.name, row[column.name], index);
        }
      });
      
      // Remove the row
      this.rows.splice(index, 1);
      
      // Update indexes for rows after the deleted one
      this.columns.forEach(column => {
        if (column.primaryKey || column.unique) {
          const indexMap = this.indexes.get(column.name);
          if (indexMap) {
            indexMap.forEach((indices, value) => {
              const updatedIndices = indices.map(i => i > index ? i - 1 : i);
              indexMap.set(value, updatedIndices.filter(i => i !== index));
            });
          }
        }
      });
    });

    // Notify database to save if rows were deleted
    if (indicesToDelete.length > 0) {
      this.notifyChange();
    }

    return { success: true, rowsAffected: indicesToDelete.length };
  }

  findByIndex(columnName: string, value: any): RowData[] {
    const index = this.indexes.get(columnName);
    if (index) {
      const indices = index.get(value);
      if (indices) {
        return indices.map(i => ({ ...this.rows[i] }));
      }
    }
    return [];
  }

  getSchema(): any {
    return {
      name: this.name,
      columns: this.columns.map(col => ({
        name: col.name,
        type: col.type,
        primaryKey: col.primaryKey,
        unique: col.unique,
        nullable: col.nullable,
        defaultValue: col.defaultValue
      })),
      rowCount: this.rows.length
    };
  }

  // Helper method to get all rows
  getAllRows(): RowData[] {
    return this.rows.map(row => ({ ...row }));
  }
}
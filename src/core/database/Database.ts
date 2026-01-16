import { Table } from './Table';
import { Column } from './Column';
import { DataType } from '../../types/database';
import fs from 'fs/promises';
import path from 'path';

export class Database {
  private tables: Map<string, Table> = new Map();
  private name: string;
  private dataDir: string;
  private dbFilePath: string;
  private isInitializing: boolean = false;

  constructor(name: string = 'default') {
    this.name = name;
    this.dataDir = path.join(process.cwd(), 'data');
    this.dbFilePath = path.join(this.dataDir, `${name}.json`);
    this.initializeStorage();
  }

  // Initialize storage and load existing data
  private async initializeStorage(): Promise<void> {
    try {
      this.isInitializing = true;
      // Create data directory if it doesn't exist
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load existing data if file exists
      await this.loadFromFile();
      console.log(`✅ Database '${this.name}' initialized`);
    } catch (error) {
      console.error('❌ Error initializing database storage:', error);
    } finally {
      this.isInitializing = false;
    }
  }

  // Load database from file
  private async loadFromFile(): Promise<void> {
    try {
      const data = await fs.readFile(this.dbFilePath, 'utf-8');
      const savedData = JSON.parse(data);
      this.restoreFromData(savedData);
      console.log(`📂 Loaded database from ${this.dbFilePath}`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, start with empty database
        console.log(`🆕 Starting new database '${this.name}'`);
      } else {
        console.error('❌ Error loading database:', error.message);
      }
    }
  }

  // Restore database from saved data
  private restoreFromData(savedData: any): void {
    if (!savedData || !savedData.tables) return;

    // Clear existing tables
    this.tables.clear();

    savedData.tables.forEach((tableData: any) => {
      try {
        // Recreate columns
        const columns = tableData.schema.columns.map((colData: any) => 
          new Column(
            colData.name,
            colData.type,
            colData.primaryKey || false,
            colData.unique || false,
            colData.nullable !== undefined ? colData.nullable : true,
            colData.defaultValue
          )
        );

        // Recreate table WITHOUT onChange callback during initialization
        // We'll add the callback after we restore all data
        const table = new Table(
          tableData.name,
          columns,
          tableData.schema.columns.find((c: any) => c.primaryKey)?.name
        );

        // Restore rows - but don't trigger onChange during restoration
        if (tableData.rows && Array.isArray(tableData.rows)) {
          // Temporarily disable the onChange functionality
          (table as any).onChange = undefined;
          
          tableData.rows.forEach((rowData: any) => {
            // Use a direct insert method that doesn't notify
            const result = this.insertWithoutNotify(table, rowData);
            if (!result.success) {
              console.warn(`⚠️ Failed to restore row in table ${tableData.name}:`, result.errors);
            }
          });
          
          // Restore the onChange callback
          (table as any).onChange = () => this.saveToFile();
        }

        this.tables.set(tableData.name, table);
      } catch (error) {
        console.error(`❌ Error restoring table ${tableData.name}:`, error);
      }
    });
  }

  // Helper method to insert without triggering notify
  private insertWithoutNotify(table: Table, rowData: any): { success: boolean; errors?: string[] } {
    // This is a simplified version that doesn't trigger onChange
    const validation = (table as any).validateRow(rowData);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    // Create new row with serialized values
    const row: any = {};
    (table as any).columns.forEach((column: Column) => {
      const value = rowData[column.name] !== undefined ? 
        (column as any).serialize(rowData[column.name]) : 
        (column as any).defaultValue;
      row[column.name] = value;
    });

    // Insert row
    const rowIndex = (table as any).rows.length;
    (table as any).rows.push(row);

    // Update indexes
    (table as any).columns.forEach((column: Column) => {
      if ((column as any).primaryKey || (column as any).unique) {
        (table as any).updateIndex(column.name, row[column.name], rowIndex);
      }
    });

    return { success: true };
  }

  // Save database to file
  private async saveToFile(): Promise<void> {
    // Don't save if we're still initializing
    if (this.isInitializing) {
      return;
    }
    
    try {
      const data = this.toJSON();
      await fs.writeFile(this.dbFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('❌ Error saving database to file:', error);
    }
  }

  // Convert database to JSON for storage
  private toJSON(): any {
    const tables: any[] = [];
    
    this.tables.forEach((table, name) => {
      try {
        tables.push({
          name,
          schema: table.getSchema(),
          rows: table.select() // Get all rows
        });
      } catch (error) {
        console.error(`❌ Error serializing table ${name}:`, error);
      }
    });

    return {
      name: this.name,
      version: '1.0',
      timestamp: new Date().toISOString(),
      tables
    };
  }

  createTable(
    tableName: string,
    columns: { name: string; type: DataType; primaryKey?: boolean; unique?: boolean }[]
  ): boolean {
    if (this.tables.has(tableName)) {
      throw new Error(`Table '${tableName}' already exists`);
    }

    const tableColumns = columns.map(col => 
      new Column(col.name, col.type, col.primaryKey || false, col.unique || false)
    );

    const primaryKeyColumn = columns.find(col => col.primaryKey)?.name;
    
    // Create table with auto-save callback
    const table = new Table(
      tableName, 
      tableColumns, 
      primaryKeyColumn,
      () => this.saveToFile() // Auto-save when table changes
    );
    
    this.tables.set(tableName, table);
    
    // Save to file immediately
    this.saveToFile();
    
    return true;
  }

  dropTable(tableName: string): boolean {
    const success = this.tables.delete(tableName);
    if (success) {
      this.saveToFile();
    }
    return success;
  }

  getTable(tableName: string): Table | undefined {
    return this.tables.get(tableName);
  }

  listTables(): string[] {
    return Array.from(this.tables.keys());
  }

  executeQuery(query: string): any {
    return { success: false, message: 'Query parser not implemented yet' };
  }

  // Helper method to get database info
  getInfo(): any {
    const tables: any[] = [];
    let totalRows = 0;
    
    this.tables.forEach((table, name) => {
      const rowCount = table.getSchema().rowCount;
      totalRows += rowCount;
      
      tables.push({
        name,
        columns: table.getSchema().columns,
        rowCount
      });
    });

    return {
      name: this.name,
      tables,
      tableCount: tables.length,
      totalRows,
      storage: {
        type: 'file',
        path: this.dbFilePath,
        size: 'auto-saved'
      }
    };
  }

  // Get storage info
  async getStorageInfo(): Promise<any> {
    try {
      const stats = await fs.stat(this.dbFilePath);
      return {
        exists: true,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        path: this.dbFilePath
      };
    } catch {
      return {
        exists: false,
        path: this.dbFilePath
      };
    }
  }

  // Manual save (optional, for testing)
  async manualSave(): Promise<void> {
    await this.saveToFile();
    console.log('💾 Manual save completed');
  }
}
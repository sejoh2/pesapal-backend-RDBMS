import { Router } from 'express';
import { Database } from '../../core/database/Database';

const router = Router();
const db = new Database('pesapal_db');

// Create a new table
router.post('/tables', (req, res) => {
  try {
    const { name, columns } = req.body;
    
    if (!name || !columns || !Array.isArray(columns)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Table name and columns array are required' 
      });
    }

    const success = db.createTable(name, columns);
    res.json({ success, message: `Table '${name}' created successfully` });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// List all tables
router.get('/tables', (req, res) => {
  const tables = db.listTables();
  res.json({ success: true, tables });
});

// Get table schema
router.get('/tables/:tableName', (req, res) => {
  const table = db.getTable(req.params.tableName);
  if (!table) {
    return res.status(404).json({ 
      success: false, 
      message: `Table '${req.params.tableName}' not found` 
    });
  }
  res.json({ success: true, schema: table.getSchema() });
});

// Insert into table
router.post('/tables/:tableName/rows', (req, res) => {
  const table = db.getTable(req.params.tableName);
  if (!table) {
    return res.status(404).json({ 
      success: false, 
      message: `Table '${req.params.tableName}' not found` 
    });
  }

  const result = table.insert(req.body);
  if (result.success) {
    res.json({ success: true, message: 'Row inserted successfully' });
  } else {
    res.status(400).json({ 
      success: false, 
      errors: result.errors 
    });
  }
});

// Bulk insert rows
router.post('/tables/:tableName/bulk', (req, res) => {
  const table = db.getTable(req.params.tableName);
  if (!table) {
    return res.status(404).json({ 
      success: false, 
      message: `Table '${req.params.tableName}' not found` 
    });
  }

  const rows = req.body;
  if (!Array.isArray(rows)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Request body must be an array of rows' 
    });
  }

  const results = {
    successCount: 0,
    errorCount: 0,
    errors: [] as string[]
  };

  rows.forEach((row, index) => {
    const result = table.insert(row);
    if (result.success) {
      results.successCount++;
    } else {
      results.errorCount++;
      results.errors.push(`Row ${index + 1}: ${result.errors?.join(', ')}`);
    }
  });

  res.json({
    success: results.errorCount === 0,
    message: `Inserted ${results.successCount} rows, ${results.errorCount} failed`,
    ...results
  });
});

// Select from table
router.get('/tables/:tableName/rows', (req, res) => {
  const table = db.getTable(req.params.tableName);
  if (!table) {
    return res.status(404).json({ 
      success: false, 
      message: `Table '${req.params.tableName}' not found` 
    });
  }

  // Basic WHERE clause support
  const where = req.query.where ? JSON.parse(req.query.where as string) : undefined;
  
  const rows = table.select(where ? (row: any) => {
    for (const [key, value] of Object.entries(where)) {
      if (row[key] !== value) return false;
    }
    return true;
  } : undefined);

  res.json({ success: true, data: rows });
});

// Get all data from table (with pagination)
router.get('/tables/:tableName/data', (req, res) => {
  const table = db.getTable(req.params.tableName);
  if (!table) {
    return res.status(404).json({ 
      success: false, 
      message: `Table '${req.params.tableName}' not found` 
    });
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
  
  let rows = table.select();
  
  if (offset > 0) {
    rows = rows.slice(offset);
  }
  
  if (limit) {
    rows = rows.slice(0, limit);
  }

  res.json({ 
    success: true, 
    data: rows,
    total: table.getSchema().rowCount,
    limit,
    offset
  });
});

// Update table rows
router.put('/tables/:tableName/rows', (req, res) => {
  const table = db.getTable(req.params.tableName);
  if (!table) {
    return res.status(404).json({ 
      success: false, 
      message: `Table '${req.params.tableName}' not found` 
    });
  }

  const { updates, where } = req.body;
  
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Updates object is required'
    });
  }

  // Create where function if provided
  const whereFunction = where ? (row: any) => {
    for (const [key, value] of Object.entries(where)) {
      // Handle type conversion for comparison
      const column = table.getSchema().columns.find((c: any) => c.name === key);
      if (column) {
        const rowValue = row[key];
        const whereValue = value;
        
        // Convert to string for comparison to handle type differences
        if (String(rowValue) !== String(whereValue)) {
          return false;
        }
      } else {
        return false;
      }
    }
    return true;
  } : undefined;

  const result = table.update(updates, whereFunction);
  
  if (result.success) {
    res.json({ 
      success: true, 
      message: `${result.rowsAffected} row(s) updated successfully`,
      rowsAffected: result.rowsAffected
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Update failed',
      errors: result.errors,
      rowsAffected: result.rowsAffected
    });
  }
});

// Delete from table with condition
router.delete('/tables/:tableName/rows', (req, res) => {
  const table = db.getTable(req.params.tableName);
  if (!table) {
    return res.status(404).json({ 
      success: false, 
      message: `Table '${req.params.tableName}' not found` 
    });
  }

  const { where } = req.body;
  const result = table.delete(where ? (row: any) => {
    for (const [key, value] of Object.entries(where)) {
      if (row[key] !== value) return false;
    }
    return true;
  } : undefined);

  res.json({ 
    success: true, 
    message: `${result.rowsAffected} row(s) deleted` 
  });
});

// Delete specific row by ID (primary key)
router.delete('/tables/:tableName/rows/:rowId', (req, res) => {
  const table = db.getTable(req.params.tableName);
  if (!table) {
    return res.status(404).json({ 
      success: false, 
      message: `Table '${req.params.tableName}' not found` 
    });
  }

  // Try to find primary key column
  const schema = table.getSchema();
  const primaryKeyColumn = schema.columns.find((col: any) => col.primaryKey);
  
  if (!primaryKeyColumn) {
    return res.status(400).json({
      success: false,
      message: 'Table has no primary key defined'
    });
  }

  const result = table.delete((row: any) => 
    String(row[primaryKeyColumn.name]) === String(req.params.rowId)
  );

  res.json({ 
    success: true, 
    message: `${result.rowsAffected} row(s) deleted`,
    rowsAffected: result.rowsAffected
  });
});

// Clear all rows from a table
router.delete('/tables/:tableName/clear', (req, res) => {
  const table = db.getTable(req.params.tableName);
  if (!table) {
    return res.status(404).json({ 
      success: false, 
      message: `Table '${req.params.tableName}' not found` 
    });
  }

  const result = table.delete(); // Delete all rows
  res.json({ 
    success: true, 
    message: `Cleared ${result.rowsAffected} rows from table`,
    rowsAffected: result.rowsAffected
  });
});

// Drop (delete) a table
router.delete('/tables/:tableName', (req, res) => {
  const success = db.dropTable(req.params.tableName);
  if (success) {
    res.json({ 
      success: true, 
      message: `Table '${req.params.tableName}' dropped successfully` 
    });
  } else {
    res.status(404).json({ 
      success: false, 
      message: `Table '${req.params.tableName}' not found` 
    });
  }
});

// Get database info
router.get('/info', (req, res) => {
  res.json({ success: true, info: db.getInfo() });
});

// Debug endpoint to see all data
router.get('/debug/:tableName', (req, res) => {
  const table = db.getTable(req.params.tableName);
  if (!table) {
    return res.status(404).json({ 
      success: false, 
      message: `Table '${req.params.tableName}' not found` 
    });
  }

  const rows = table.select();
  
  res.json({
    success: true,
    table: req.params.tableName,
    schema: table.getSchema(),
    rows: rows,
    rowCount: rows.length
  });
});

export default router;
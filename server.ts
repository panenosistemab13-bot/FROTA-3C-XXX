import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("logistica_v2.db");

// Initialize database with new schema
db.exec(`
  CREATE TABLE IF NOT EXISTS scale_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data_escala TEXT,
    status TEXT DEFAULT 'Open', -- 'Open', 'Archived'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS escala (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scale_group_id INTEGER,
    cavalo TEXT NOT NULL,
    bau1 TEXT NOT NULL,
    bau2 TEXT, 
    tipo_veiculo TEXT NOT NULL, 
    liberacao_status TEXT, 
    agendamento_status TEXT, 
    yard_status TEXT DEFAULT '', -- Deprecated
    bau1_yard_status TEXT DEFAULT '',
    bau2_yard_status TEXT DEFAULT '',
    bau1_exp_status TEXT DEFAULT 'Pendente',
    bau1_exp_turno TEXT DEFAULT 'A',
    bau2_exp_status TEXT DEFAULT 'Pendente',
    bau2_exp_turno TEXT DEFAULT 'A',
    veiculo_atrelado TEXT DEFAULT '',
    bau1_doca_action TEXT DEFAULT '',
    bau1_doca_number TEXT DEFAULT '',
    bau2_doca_action TEXT DEFAULT '',
    bau2_doca_number TEXT DEFAULT '',
    data_escala TEXT, -- Legacy, now on group
    saved INTEGER DEFAULT 0, -- Legacy, now on group status
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scale_group_id) REFERENCES scale_groups (id)
  );

  CREATE TABLE IF NOT EXISTS veiculos (
    placa TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'Checklist OK',
    validade DATETIME,
    tipo TEXT NOT NULL DEFAULT 'Cavalo', -- 'Cavalo' or 'Bau'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS frota (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    escala_id INTEGER UNIQUE, -- Each scale entry can only be in the fleet once
    status TEXT NOT NULL, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (escala_id) REFERENCES escala (id)
  );

  CREATE TABLE IF NOT EXISTS docas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    frota_id INTEGER,
    numero_doca INTEGER NOT NULL,
    status TEXT NOT NULL, 
    bau TEXT, -- Link dock to specific trailer
    FOREIGN KEY (frota_id) REFERENCES frota (id)
  );

  CREATE TABLE IF NOT EXISTS historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scale_group_id INTEGER,
    escala_id INTEGER,
    cavalo TEXT,
    bau1 TEXT,
    bau2 TEXT,
    tipo_veiculo TEXT,
    frota_status TEXT,
    data_finalizacao DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrations for existing tables
try { db.exec("ALTER TABLE escala ADD COLUMN yard_status TEXT DEFAULT 'Vazio'"); } catch(e) {}
try { db.exec("ALTER TABLE escala ADD COLUMN liberacao_status TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE escala ADD COLUMN agendamento_status TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE escala ADD COLUMN bau1_exp_status TEXT DEFAULT 'Pendente'"); } catch(e) {}
try { db.exec("ALTER TABLE escala ADD COLUMN bau1_exp_turno TEXT DEFAULT 'A'"); } catch(e) {}
try { db.exec("ALTER TABLE escala ADD COLUMN bau2_exp_status TEXT DEFAULT 'Pendente'"); } catch(e) {}
try { db.exec("ALTER TABLE escala ADD COLUMN bau2_exp_turno TEXT DEFAULT 'A'"); } catch(e) {}
try { db.exec("ALTER TABLE docas ADD COLUMN bau TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE escala ADD COLUMN data_escala TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE veiculos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'Cavalo'"); } catch(e) {}
try { db.exec("ALTER TABLE veiculos ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch(e) {}
try { db.exec("ALTER TABLE escala ADD COLUMN bau1_yard_status TEXT DEFAULT 'Vazio'"); } catch(e) {}
try { db.exec("ALTER TABLE escala ADD COLUMN bau2_yard_status TEXT DEFAULT 'Vazio'"); } catch(e) {}
try { db.exec("ALTER TABLE escala ADD COLUMN saved INTEGER DEFAULT 0"); } catch(e) {}
// New migrations
try { db.exec("ALTER TABLE escala ADD COLUMN scale_group_id INTEGER"); } catch(e) {}
try { db.exec("ALTER TABLE historico ADD COLUMN scale_group_id INTEGER"); } catch(e) {}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  app.use(express.json());

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("send_message", (data) => {
      try {
        const { user, text } = data;
        const info = db.prepare("INSERT INTO messages (user, text) VALUES (?, ?)").run(user, text);
        const newMessage = {
          id: info.lastInsertRowid,
          user,
          text,
          timestamp: new Date().toISOString()
        };
        io.emit("receive_message", newMessage);
      } catch (err) {
        console.error("Error saving message:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // API Routes for Messages
  app.get("/api/messages", (req, res) => {
    try {
      const messages = db.prepare("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50").all();
      res.json(messages.reverse());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API Routes for Scale Groups
  app.get("/api/scale-groups", (req, res) => {
    try {
      const { status } = req.query;
      let query = "SELECT * FROM scale_groups";
      const params = [];
      if (status) {
        query += " WHERE status = ?";
        params.push(status);
      }
      query += " ORDER BY created_at DESC";
      
      const groups = db.prepare(query).all(...params);
      
      // Attach items count to each group
      const result = groups.map((g: any) => {
        const count = db.prepare("SELECT COUNT(*) as count FROM escala WHERE scale_group_id = ?").get(g.id);
        return { ...g, items_count: (count as any).count };
      });
      
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/scale-groups", (req, res) => {
    const { data_escala } = req.body;
    if (!data_escala) return res.status(400).json({ error: "Data é obrigatória" });
    try {
      const info = db.prepare("INSERT INTO scale_groups (data_escala) VALUES (?)").run(data_escala);
      res.status(201).json({ id: info.lastInsertRowid, data_escala, status: 'Open' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/scale-groups/:id/archive", (req, res) => {
    const { id } = req.params;
    try {
      const transaction = db.transaction(() => {
        // 1. Mark group as archived
        db.prepare("UPDATE scale_groups SET status = 'Archived' WHERE id = ?").run(id);
        
        // 2. Get all items in this scale group
        const items = db.prepare("SELECT * FROM escala WHERE scale_group_id = ?").all(id);
        
        const insertHist = db.prepare(`
          INSERT INTO historico (scale_group_id, escala_id, cavalo, bau1, bau2, tipo_veiculo, frota_status, data_finalizacao)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const item of items as any) {
          // 3. Check if already in history
          const exists = db.prepare("SELECT id FROM historico WHERE escala_id = ? AND scale_group_id = ?").get(item.id, id);
          
          if (!exists) {
            // Determine status: if it was in frota, use that status, otherwise 'Arquivado'
            const frotaEntry = db.prepare('SELECT status, id FROM frota WHERE escala_id = ?').get(item.id);
            const status = frotaEntry ? (frotaEntry as any).status : 'Arquivado';
            
            insertHist.run(id, item.id, item.cavalo, item.bau1, item.bau2, item.tipo_veiculo, status, new Date().toISOString());
            
            // 4. If it was in frota, remove it (and its docas)
            if (frotaEntry) {
              db.prepare('DELETE FROM docas WHERE frota_id = ?').run((frotaEntry as any).id);
              db.prepare('DELETE FROM frota WHERE escala_id = ?').run(item.id);
            }
          }
        }
      });
      
      transaction();
      res.json({ message: "Escala arquivada e itens movidos para o histórico com sucesso" });
    } catch (err) {
      console.error("Erro ao arquivar escala:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/scale-groups/:id", (req, res) => {
    const { id } = req.params;
    try {
      const transaction = db.transaction(() => {
        // 1. Get all escala items in this group
        const items = db.prepare("SELECT id FROM escala WHERE scale_group_id = ?").all(id);
        
        for (const item of items as any) {
          // 2. Clean up frota and docas for each item
          const frotaEntry = db.prepare('SELECT id FROM frota WHERE escala_id = ?').get(item.id);
          if (frotaEntry) {
            db.prepare('DELETE FROM docas WHERE frota_id = ?').run((frotaEntry as any).id);
            db.prepare('DELETE FROM frota WHERE escala_id = ?').run(item.id);
          }
          // 3. Delete escala item
          db.prepare("DELETE FROM escala WHERE id = ?").run(item.id);
        }
        
        // 4. Delete the group itself
        db.prepare("DELETE FROM scale_groups WHERE id = ?").run(id);
      });
      
      transaction();
      res.status(200).json({ message: "Escala e todos os seus itens removidos com sucesso" });
    } catch (err) {
      console.error("Erro ao deletar grupo de escala:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Routes for Escala
  app.get("/api/escala", (req, res) => {
    const { group_id } = req.query;
    try {
      let query = `
        SELECT 
          e.*, 
          CASE WHEN f.escala_id IS NOT NULL THEN 1 ELSE 0 END as isInFrota,
          v_cav.status as cavalo_status,
          v_bau1.status as bau1_status,
          v_bau2.status as bau2_status,
          v_cav.validade as cavalo_validade,
          v_bau1.validade as bau1_validade,
          v_bau2.validade as bau2_validade
        FROM escala e
        LEFT JOIN frota f ON e.id = f.escala_id
        LEFT JOIN veiculos v_cav ON e.cavalo = v_cav.placa
        LEFT JOIN veiculos v_bau1 ON e.bau1 = v_bau1.placa
        LEFT JOIN veiculos v_bau2 ON e.bau2 = v_bau2.placa
      `;
      
      const params = [];
      if (group_id) {
        query += " WHERE e.scale_group_id = ?";
        params.push(group_id);
      } else {
        // If no group specified, maybe show all? Or just those without group?
        // For backward compatibility, let's show all or those without group.
        // But the UI will drive this.
      }
      
      query += " ORDER BY e.created_at DESC";

      const items = db.prepare(query).all(...params);

      // Helper to determine overall status
      const processedItems = items.map((item: any) => {
        const statuses = [item.cavalo_status, item.bau1_status, item.bau2_status].filter(Boolean);
        
        let overallStatus = 'Checklist OK';
        if (statuses.includes('Negativado')) overallStatus = 'Negativado';
        else if (statuses.includes('Precisa de Manutenção')) overallStatus = 'Precisa de Manutenção';
        else if (statuses.includes('Checklist Vencido')) overallStatus = 'Checklist Vencido';
        
        // Check for expiration dynamically too
        const now = new Date();
        [item.cavalo_validade, item.bau1_validade, item.bau2_validade].forEach(v => {
          if (v && new Date(v) < now) {
            if (overallStatus !== 'Negativado' && overallStatus !== 'Precisa de Manutenção') {
              overallStatus = 'Checklist Vencido';
            }
          }
        });

        return { ...item, checklist_status: overallStatus };
      });

      res.json(processedItems);
    } catch (err) {
      console.error("Erro ao buscar escala:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/escala", (req, res) => {
    const { cavalo, bau1, bau2, tipo_veiculo, data_escala, scale_group_id } = req.body;
    if (!cavalo || !bau1 || !tipo_veiculo) {
      return res.status(400).json({ error: "Campos obrigatórios faltando (Cavalo, Baú 1 ou Tipo)" });
    }

    // Bloqueio de Duplicidade (Regra de Integridade)
    if (tipo_veiculo === 'Rodo Trem' && bau2 && bau1 === bau2) {
      return res.status(400).json({ error: "Duplicidade de placas: Baú 1 e Baú 2 não podem ser iguais." });
    }
    
    try {
      const info = db.prepare("INSERT INTO escala (cavalo, bau1, bau2, tipo_veiculo, data_escala, scale_group_id) VALUES (?, ?, ?, ?, ?, ?)")
        .run(cavalo, bau1, bau2 || null, tipo_veiculo, data_escala || null, scale_group_id || null);
      res.status(201).json({ id: info.lastInsertRowid, ...req.body });
    } catch (err) {
      console.error("Erro ao inserir na escala:", err);
      res.status(500).json({ error: "Erro interno ao salvar escala: " + err.message });
    }
  });

  app.post("/api/escala/save", (req, res) => {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: "Data é obrigatória" });

    try {
      // 1. Mark items as saved
      db.prepare("UPDATE escala SET saved = 1 WHERE data_escala = ?").run(date);
      
      // 2. Copy to historico (optional, based on interpretation, but let's do it to be safe if they want it there)
      // Note: We only copy if not already there to avoid duplicates? 
      // Or maybe we just rely on the 'saved' flag in Escala to show it in History view?
      // The user said "MANDE A ESCALA APOS SALVAR PARA A PAGINA HISTORICO".
      // I'll insert into historico.
      const items = db.prepare("SELECT * FROM escala WHERE data_escala = ?").all(date);
      const insertHist = db.prepare(`
        INSERT INTO historico (escala_id, cavalo, bau1, bau2, tipo_veiculo, frota_status, data_finalizacao)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      const transaction = db.transaction((items) => {
        for (const item of items) {
           // Check if already in history to avoid dupes?
           // For now, let's assume "saving" is a one-time action or we allow duplicates if saved multiple times (snapshots).
           // Better: Check if exists.
           const exists = db.prepare("SELECT id FROM historico WHERE escala_id = ?").get(item.id);
           if (!exists) {
             insertHist.run(item.id, item.cavalo, item.bau1, item.bau2, item.tipo_veiculo, 'Salvo na Escala', new Date().toISOString());
           }
        }
      });
      transaction(items);

      res.json({ message: "Escala salva com sucesso" });
    } catch (err) {
      console.error("Erro ao salvar escala:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/escala/:id", (req, res) => {
    const { 
      liberacao_status, agendamento_status, yard_status, 
      bau1_exp_status, bau1_exp_turno, bau2_exp_status, bau2_exp_turno, 
      bau1_yard_status, bau2_yard_status,
      veiculo_atrelado,
      bau1_doca_action, bau1_doca_number,
      bau2_doca_action, bau2_doca_number,
      cavalo, bau1, bau2, tipo_veiculo
    } = req.body;
    const { id } = req.params;
    try {
      const fields = [];
      const values = [];
      if (liberacao_status !== undefined) { fields.push("liberacao_status = ?"); values.push(liberacao_status); }
      if (agendamento_status !== undefined) { fields.push("agendamento_status = ?"); values.push(agendamento_status); }
      if (yard_status !== undefined) { fields.push("yard_status = ?"); values.push(yard_status); }
      if (bau1_exp_status !== undefined) { fields.push("bau1_exp_status = ?"); values.push(bau1_exp_status); }
      if (bau1_exp_turno !== undefined) { fields.push("bau1_exp_turno = ?"); values.push(bau1_exp_turno); }
      if (bau2_exp_status !== undefined) { fields.push("bau2_exp_status = ?"); values.push(bau2_exp_status); }
      if (bau2_exp_turno !== undefined) { fields.push("bau2_exp_turno = ?"); values.push(bau2_exp_turno); }
      if (bau1_yard_status !== undefined) { fields.push("bau1_yard_status = ?"); values.push(bau1_yard_status); }
      if (bau2_yard_status !== undefined) { fields.push("bau2_yard_status = ?"); values.push(bau2_yard_status); }
      if (veiculo_atrelado !== undefined) { fields.push("veiculo_atrelado = ?"); values.push(veiculo_atrelado); }
      if (bau1_doca_action !== undefined) { fields.push("bau1_doca_action = ?"); values.push(bau1_doca_action); }
      if (bau1_doca_number !== undefined) { fields.push("bau1_doca_number = ?"); values.push(bau1_doca_number); }
      if (bau2_doca_action !== undefined) { fields.push("bau2_doca_action = ?"); values.push(bau2_doca_action); }
      if (bau2_doca_number !== undefined) { fields.push("bau2_doca_number = ?"); values.push(bau2_doca_number); }
      
      // New fields for editing plates
      if (cavalo !== undefined) { fields.push("cavalo = ?"); values.push(cavalo.toUpperCase().trim()); }
      if (bau1 !== undefined) { fields.push("bau1 = ?"); values.push(bau1.toUpperCase().trim()); }
      if (bau2 !== undefined) { fields.push("bau2 = ?"); values.push(bau2 ? bau2.toUpperCase().trim() : null); }
      if (tipo_veiculo !== undefined) { fields.push("tipo_veiculo = ?"); values.push(tipo_veiculo); }
      
      if (fields.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar" });
      
      values.push(id);
      db.prepare(`UPDATE escala SET ${fields.join(", ")} WHERE id = ?`).run(...values);
      res.status(200).json({ message: "Escala atualizada com sucesso" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/escala/:id", (req, res) => {
    const { id } = req.params;
    try {
      // First, check if it's in frota to clean up docas and frota entry
      const frotaEntry = db.prepare('SELECT id FROM frota WHERE escala_id = ?').get(id);
      if (frotaEntry) {
        db.prepare('DELETE FROM docas WHERE frota_id = ?').run(frotaEntry.id);
        db.prepare('DELETE FROM frota WHERE escala_id = ?').run(id);
      }
      
      const info = db.prepare("DELETE FROM escala WHERE id = ?").run(id);
      if (info.changes === 0) {
        return res.status(404).json({ error: "Registro não encontrado na escala" });
      }
      res.status(200).json({ message: "Item removido da escala com sucesso" });
    } catch (err) {
      console.error("Erro ao deletar da escala:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Routes for Docks (Docas)
  app.put("/api/docas/:id", (req, res) => {
    const { status, bau, numero_doca } = req.body;
    const { id } = req.params;
    try {
      const fields = [];
      const values = [];
      if (status !== undefined) { fields.push("status = ?"); values.push(status); }
      if (bau !== undefined) { fields.push("bau = ?"); values.push(bau); }
      if (numero_doca !== undefined) { fields.push("numero_doca = ?"); values.push(numero_doca); }

      if (fields.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar" });

      values.push(id);
      db.prepare(`UPDATE docas SET ${fields.join(", ")} WHERE id = ?`).run(...values);
      res.status(200).json({ message: "Doca atualizada com sucesso" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/docas/:id", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM docas WHERE id = ?").run(id);
      res.status(200).json({ message: "Doca removida com sucesso" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API Routes for Docas (new)
  app.get("/api/docas", (req, res) => {
    try {
      // Get all vehicles from open scale groups that have at least one baú in the docas-relevant statuses
      const items = db.prepare(`
        SELECT e.* 
        FROM escala e
        JOIN scale_groups sg ON e.scale_group_id = sg.id
        WHERE sg.status = 'Open'
        AND (
          e.bau1_yard_status IN ('Carregado com Produto', 'Vazio', 'Carregado com Paletes')
          OR e.bau2_yard_status IN ('Carregado com Produto', 'Vazio', 'Carregado com Paletes')
        )
      `).all();
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API Routes for Checklist
  app.get("/api/checklists", (req, res) => {
    const items = db.prepare("SELECT * FROM veiculos ORDER BY placa ASC").all();
    res.json(items);
  });

  app.post("/api/checklists", (req, res) => {
    const { placa, status, validade, tipo } = req.body;
    if (!placa || !status) {
      return res.status(400).json({ error: "Placa e status são obrigatórios" });
    }
    db.prepare("INSERT INTO veiculos (placa, status, validade, tipo) VALUES (?, ?, ?, ?) ON CONFLICT(placa) DO UPDATE SET status=excluded.status, validade=excluded.validade, tipo=excluded.tipo")
      .run(placa, status, validade, tipo || 'Cavalo');
    res.json({ message: "Checklist atualizado" });
  });

  app.delete("/api/checklists/:placa", (req, res) => {
    const { placa } = req.params;
    try {
      const transaction = db.transaction(() => {
        // 1. Encontrar todos os IDs de escala relacionados a esta placa (seja cavalo ou baú)
        const escalaItems = db.prepare("SELECT id FROM escala WHERE cavalo = ? OR bau1 = ? OR bau2 = ?").all(placa, placa, placa);
        
        for (const item of escalaItems as any) {
          // 2. Remover da Frota e Docas
          const frotaEntry = db.prepare('SELECT id FROM frota WHERE escala_id = ?').get(item.id);
          if (frotaEntry) {
            db.prepare('DELETE FROM docas WHERE frota_id = ?').run((frotaEntry as any).id);
            db.prepare('DELETE FROM frota WHERE escala_id = ?').run(item.id);
          }
          // 3. Remover da Escala
          db.prepare("DELETE FROM escala WHERE id = ?").run(item.id);
        }

        // 4. Remover do Checklist (Veículos)
        db.prepare("DELETE FROM veiculos WHERE placa = ?").run(placa);
      });
      
      transaction();
      res.status(200).json({ message: "Veículo e todos os processos relacionados removidos com sucesso" });
    } catch (err) {
      console.error("Erro ao deletar checklist em cascata:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Routes for Frota
  app.get("/api/frota", (req, res) => {
    try {
      const frota = db.prepare(`
        SELECT 
          e.*, 
          f.id as frota_id, -- Explicitly select frota id
          f.status as frota_status,
          v_cav.status as cavalo_status,
          v_bau1.status as bau1_status,
          v_bau2.status as bau2_status,
          v_cav.validade as cavalo_validade,
          v_bau1.validade as bau1_validade,
          v_bau2.validade as bau2_validade
        FROM escala e
        JOIN frota f ON e.id = f.escala_id
        LEFT JOIN veiculos v_cav ON e.cavalo = v_cav.placa
        LEFT JOIN veiculos v_bau1 ON e.bau1 = v_bau1.placa
        LEFT JOIN veiculos v_bau2 ON e.bau2 = v_bau2.placa
        ORDER BY f.created_at DESC
      `).all();

      const result = frota.map((item: any) => {
        const docas = db.prepare('SELECT id, numero_doca, status, bau FROM docas WHERE frota_id = ?').all(item.frota_id);
        
        // Helper to determine overall status (same logic as escala)
        const statuses = [item.cavalo_status, item.bau1_status, item.bau2_status].filter(Boolean);
        let overallStatus = 'Checklist OK';
        if (statuses.includes('Negativado')) overallStatus = 'Negativado';
        else if (statuses.includes('Precisa de Manutenção')) overallStatus = 'Precisa de Manutenção';
        else if (statuses.includes('Checklist Vencido')) overallStatus = 'Checklist Vencido';
        
        const now = new Date();
        [item.cavalo_validade, item.bau1_validade, item.bau2_validade].forEach(v => {
          if (v && new Date(v) < now) {
            if (overallStatus !== 'Negativado' && overallStatus !== 'Precisa de Manutenção') {
              overallStatus = 'Checklist Vencido';
            }
          }
        });

        return { ...item, docas, checklist_status: overallStatus };
      });

      res.json(result);
    } catch (err) {
      console.error("Erro ao buscar frota:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/frota', (req, res) => {
    const { escala_id } = req.body;
    if (!escala_id) {
      return res.status(400).json({ error: 'escala_id é obrigatório' });
    }
    try {
      // Default status when adding to frota
      const info = db.prepare('INSERT INTO frota (escala_id, status) VALUES (?, ?)')
        .run(escala_id, 'Carregado com Produtos');
      res.status(201).json({ id: info.lastInsertRowid });
    } catch (err) {
      // Handle unique constraint violation (already in frota)
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Este item da escala já está na frota.' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // Rota para atualizar o status de um item da frota
  app.put('/api/frota/:id/status', (req, res) => {
    const { status } = req.body;
    const { id } = req.params;
    if (!['Carregado com Palete', 'Carregado com Produtos', 'Vazio'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    try {
      // Here, id refers to the escala_id, which is the frota's primary identifier link
      db.prepare('UPDATE frota SET status = ? WHERE escala_id = ?').run(status, id);
      res.status(200).json({ message: 'Status atualizado com sucesso' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Rota para adicionar uma doca a um item da frota
  app.post('/api/frota/:id/docas', (req, res) => {
    const { numero, status, bau } = req.body;
    const { id } = req.params; // This is escala_id
    if (!numero || !status) {
      return res.status(400).json({ error: 'Número da doca e status são obrigatórios' });
    }
    try {
      // Find frota id from escala_id
      const frotaEntry = db.prepare('SELECT id FROM frota WHERE escala_id = ?').get(id);
      if (!frotaEntry) {
        return res.status(404).json({ error: 'Item da frota não encontrado.' });
      }
      db.prepare('INSERT INTO docas (frota_id, numero_doca, status, bau) VALUES (?, ?, ?, ?)')
        .run(frotaEntry.id, numero, status, bau || null);
      res.status(201).json({ message: 'Doca adicionada com sucesso' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Rota para remover um item da frota
  app.delete('/api/frota/:id', (req, res) => {
    const { id } = req.params; // This is escala_id
    try {
      const frotaEntry = db.prepare('SELECT * FROM frota WHERE escala_id = ?').get(id);
      if (frotaEntry) {
        // Get escala details for history
        const escalaEntry = db.prepare('SELECT * FROM escala WHERE id = ?').get(id);
        
        // Insert into history if not already there
        const exists = db.prepare('SELECT id FROM historico WHERE escala_id = ?').get(id);
        if (!exists) {
          db.prepare(`
            INSERT INTO historico (escala_id, cavalo, bau1, bau2, tipo_veiculo, frota_status, scale_group_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(id, escalaEntry.cavalo, escalaEntry.bau1, escalaEntry.bau2, escalaEntry.tipo_veiculo, frotaEntry.status, escalaEntry.scale_group_id);
        }

        db.prepare('DELETE FROM docas WHERE frota_id = ?').run(frotaEntry.id);
        db.prepare('DELETE FROM frota WHERE escala_id = ?').run(id);
      }
      res.status(200).json({ message: 'Item removido da frota e movido para histórico' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Rota para buscar histórico
  app.get('/api/historico', (req, res) => {
    try {
      const items = db.prepare('SELECT * FROM historico ORDER BY data_finalizacao DESC').all();
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Rota para limpar histórico
  app.delete('/api/historico', (req, res) => {
    try {
      db.prepare('DELETE FROM historico').run();
      res.status(200).json({ message: "Histórico limpo com sucesso" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

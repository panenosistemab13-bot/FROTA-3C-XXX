
import Database from "better-sqlite3";

const db = new Database("logistica_v2.db");

console.log("--- Forçando Exclusão de POD0255 da Frota ---");

try {
  const transaction = db.transaction(() => {
    // 1. Encontrar o ID da escala para este cavalo
    const escalaItem = db.prepare("SELECT id FROM escala WHERE cavalo = 'POD0255'").get();
    
    if (!escalaItem) {
      console.log("Veículo POD0255 não encontrado na escala.");
      return;
    }
    
    const escalaId = (escalaItem as any).id;
    console.log(`Encontrado Escala ID: ${escalaId}`);

    // 2. Encontrar o item na frota
    const frotaItem = db.prepare("SELECT id FROM frota WHERE escala_id = ?").get(escalaId);
    
    if (frotaItem) {
      const frotaId = (frotaItem as any).id;
      console.log(`Encontrado Frota ID: ${frotaId}`);

      // 3. Remover Docas vinculadas
      const docasInfo = db.prepare("DELETE FROM docas WHERE frota_id = ?").run(frotaId);
      console.log(`Docas removidas: ${docasInfo.changes}`);

      // 4. Remover da Frota
      const frotaInfo = db.prepare("DELETE FROM frota WHERE id = ?").run(frotaId);
      console.log(`Item removido da Frota: ${frotaInfo.changes}`);
    } else {
      console.log("Veículo não está na tabela de Frota (já foi removido ou nunca entrou).");
    }

    // 5. Opcional: Remover da Escala também? 
    // O usuário pediu para excluir da tela "Veículos em Operação" (Frota).
    // Se ele quiser remover da Escala, é outra ação.
    // Mas geralmente "Excluir" na Frota apenas remove da operação ativa e volta para histórico ou libera.
    // O código original do DELETE /api/frota/:id move para histórico.
    // Vamos simular o comportamento da API: mover para histórico se não existir.
    
    const existsHist = db.prepare('SELECT id FROM historico WHERE escala_id = ?').get(escalaId);
    if (!existsHist) {
       const escalaFull = db.prepare("SELECT * FROM escala WHERE id = ?").get(escalaId);
       const frotaStatus = frotaItem ? 'Com Produto' : 'Removido Manualmente'; // Fallback
       
       if (escalaFull) {
         db.prepare(`
            INSERT INTO historico (escala_id, cavalo, bau1, bau2, tipo_veiculo, frota_status, scale_group_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
         `).run(escalaId, (escalaFull as any).cavalo, (escalaFull as any).bau1, (escalaFull as any).bau2, (escalaFull as any).tipo_veiculo, frotaStatus, (escalaFull as any).scale_group_id);
         console.log("Movido para Histórico.");
       }
    }

  });

  transaction();
  console.log("Operação concluída com sucesso.");

} catch (err) {
  console.error("Erro ao forçar exclusão:", err);
}


import Database from "better-sqlite3";

const db = new Database("logistica_v2.db");

console.log("--- Diagnóstico para POD0255 ---");

// 1. Buscar na tabela Escala
const escalaItems = db.prepare("SELECT * FROM escala WHERE cavalo = 'POD0255'").all();
console.log("\n1. Registros em Escala:", escalaItems);

if (escalaItems.length > 0) {
  escalaItems.forEach((item: any) => {
    console.log(`\n--- Detalhes para Escala ID: ${item.id} ---`);
    
    // 2. Buscar na tabela Frota
    const frotaItem = db.prepare("SELECT * FROM frota WHERE escala_id = ?").get(item.id);
    console.log("2. Registro em Frota:", frotaItem);

    if (frotaItem) {
      // 3. Buscar na tabela Docas
      const docasItems = db.prepare("SELECT * FROM docas WHERE frota_id = ?").all((frotaItem as any).id);
      console.log("3. Registros em Docas:", docasItems);
    }

    // 4. Buscar na tabela Historico
    const historicoItems = db.prepare("SELECT * FROM historico WHERE escala_id = ?").all(item.id);
    console.log("4. Registros em Historico:", historicoItems);
  });
} else {
  console.log("Nenhum registro encontrado na escala para POD0255.");
}

// 5. Verificar duplicidade de carretas (POF7735)
console.log("\n--- Verificação de Duplicidade de Carretas (POF7735) ---");
const duplicidade = db.prepare("SELECT * FROM escala WHERE bau1 = 'POF7735' AND bau2 = 'POF7735'").all();
console.log("Registros com POF7735 em ambos os baús:", duplicidade);

console.log("\n--- Fim do Diagnóstico ---");

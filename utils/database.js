const Database = require('better-sqlite3');

// A conexão com o banco de dados continua a mesma.
const db = new Database('sorteios.sqlite');

// Variáveis para os comandos do banco de dados
let getSorteioStmt;
let getAllActiveSorteiosStmt;
let addSorteioStmt;
let updateParticipantesStmt;
let updateStatusStmt;

/**
 * Prepara o banco de dados, criando a tabela e preparando os comandos.
 */
function initDb() {
    // Usando console.log em vez de log()
    console.log('Inicializando banco de dados para sorteios...');
    
    // Cria a tabela de sorteios se ela não existir.
    const createTableStmt = db.prepare(`
        CREATE TABLE IF NOT EXISTS sorteios (
            messageId TEXT PRIMARY KEY,
            channelId TEXT NOT NULL,
            guildId TEXT NOT NULL,
            premio TEXT NOT NULL,
            descricao TEXT,
            timestampFim INTEGER NOT NULL,
            vencedores INTEGER NOT NULL,
            cor TEXT,
            thumbnail TEXT,
            footer TEXT,
            requiredRoleId TEXT,
            autorId TEXT NOT NULL,
            ganhadorForcado TEXT,
            participantes TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'ativo'
        )
    `);
    createTableStmt.run();

    // Prepara os comandos após garantir que a tabela existe.
    getSorteioStmt = db.prepare('SELECT * FROM sorteios WHERE messageId = ?');
    getAllActiveSorteiosStmt = db.prepare("SELECT * FROM sorteios WHERE status = 'ativo'");
    addSorteioStmt = db.prepare('INSERT INTO sorteios (messageId, channelId, guildId, premio, descricao, timestampFim, vencedores, cor, thumbnail, footer, requiredRoleId, autorId, ganhadorForcado, participantes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    updateParticipantesStmt = db.prepare('UPDATE sorteios SET participantes = ? WHERE messageId = ?');
    updateStatusStmt = db.prepare("UPDATE sorteios SET status = ? WHERE messageId = ?");

    // Usando console.log em vez de log()
    console.log('Banco de dados de sorteios pronto.');
}

module.exports = {
    initDb,

    saveSorteio: (sorteio) => {
        try {
            addSorteioStmt.run(
                sorteio.messageId,
                sorteio.channelId,
                sorteio.guildId,
                sorteio.premio,
                sorteio.descricao,
                sorteio.timestampFim,
                sorteio.vencedores,
                sorteio.cor,
                sorteio.thumbnail,
                sorteio.footer,
                sorteio.requiredRoleId,
                sorteio.autor.id,
                sorteio.ganhadorForcado,
                JSON.stringify(Array.from(sorteio.participantes))
            );
        } catch (err) {
            // Usando console.error em vez de error()
            console.error('Erro ao salvar sorteio no banco de dados:', err);
        }
    },

    updateSorteioParticipantes: (messageId, participantesSet) => {
        try {
            const participantesArray = Array.from(participantesSet);
            updateParticipantesStmt.run(JSON.stringify(participantesArray), messageId);
        } catch (err) {
            console.error('Erro ao atualizar participantes no banco de dados:', err);
        }
    },

    finalizeSorteioInDb: (messageId) => {
        try {
            updateStatusStmt.run('finalizado', messageId);
        } catch (err) {
            console.error('Erro ao finalizar sorteio no banco de dados:', err);
        }
    },

    fetchSorteio: (messageId) => {
        const row = getSorteioStmt.get(messageId);
        if (!row) return null;
        row.participantes = new Set(JSON.parse(row.participantes));
        return row;
    },

    fetchAllActiveSorteios: () => {
        const rows = getAllActiveSorteiosStmt.all();
        return rows.map(row => {
            row.participantes = new Set(JSON.parse(row.participantes));
            return row;
        });
    }
};
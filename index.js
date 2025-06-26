// Módulos principais do Discord e Node.js
const { Client, Collection, GatewayIntentBits, ActivityType, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

// Módulos para sistemas específicos
const { initDb } = require('./utils/database');
const { carregarSorteiosAtivos } = require('./commands/giveway');

// Configuração do Cliente (Bot) com intents otimizados
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
});

client.commands = new Collection();

// Carregadores de Handlers
require('./handler/commandHandler')(client);

// ===================================================================================
// CARREGAMENTO DE EVENTOS MELHORADO
// ===================================================================================
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
    
    console.log(`✅ Evento carregado: ${event.name}`);
}

// ===================================================================================
// EVENTO 'ready': EXECUTADO QUANDO O BOT FICA ONLINE
// ===================================================================================
client.once('ready', async () => {
    console.log(`🔥 BOT ONLINE COMO ${client.user.tag}`);
    console.log(`📊 Conectado em ${client.guilds.cache.size} servidor(es)`);
    console.log(`👥 Servindo ${client.users.cache.size} usuários`);
    
    // Inicialização dos sistemas
    initDb();
    await carregarSorteiosAtivos(client);
    console.log('✅ Sistemas de Sorteio e Banco de Dados prontos.');

    // Sistema de status rotativo melhorado
    const statusList = [
        { name: 'Consultando BINs', type: ActivityType.Watching },
        { name: 'Adicionando estoque', type: ActivityType.Playing },
        { name: 'Verificando saldo de cartões', type: ActivityType.Watching },
        { name: 'Garantindo qualidade', type: ActivityType.Playing },
        { name: 'Processando pagamentos', type: ActivityType.Listening },
        { name: 'Entregando produtos', type: ActivityType.Competing },
    ];
    
    let statusIndex = 0;
    
    // Define o status inicial
    const initialStatus = statusList[0];
    client.user.setActivity(initialStatus.name, { type: initialStatus.type });
    
    // Rotaciona os status a cada 15 segundos
    setInterval(() => {
        statusIndex = (statusIndex + 1) % statusList.length;
        const status = statusList[statusIndex];
        client.user.setActivity(status.name, { type: status.type });
    }, 15000);
    
    console.log('🎭 Sistema de status rotativo ativado.');
});

// ===================================================================================
// TRATAMENTO DE ERROS GLOBAIS
// ===================================================================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// ===================================================================================
// INICIALIZAÇÃO DO BOT
// ===================================================================================
client.login(config.token).catch(error => {
    console.error('❌ Falha ao fazer login:', error);
    process.exit(1);
});
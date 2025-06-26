const { error } = require('../utils/logger');

// Set para rastrear interações já processadas
const processedInteractions = new Set();

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    const { client } = interaction;

    // Previne processamento duplicado
    if (processedInteractions.has(interaction.id)) {
      console.log(`[Handler] Interação ${interaction.id} já foi processada, ignorando.`);
      return;
    }
    
    // Adiciona a interação ao set de processadas
    processedInteractions.add(interaction.id);
    
    // Remove a interação do set após 30 segundos para evitar vazamento de memória
    setTimeout(() => {
      processedInteractions.delete(interaction.id);
    }, 30000);

    try {
      // --- Tratamento para Comandos de Barra (/) ---
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          console.error(`[Handler] Comando "${interaction.commandName}" não foi encontrado.`);
          return interaction.reply({ content: 'Este comando não foi encontrado.', ephemeral: true });
        }
        await command.execute(interaction);
        return;
      }

      // --- Roteador Inteligente para Componentes (Botões, Menus, Modais) ---
      if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
        // Extrai o nome do comando do customId (ex: "painel:abrir_troca" -> "painel")
        const commandName = interaction.customId.split(':')[0];
        const command = client.commands.get(commandName);

        if (!command) {
          console.warn(`[Handler] Nenhum comando encontrado para o prefixo no customId: "${commandName}"`);
          // Avisa ao usuário que o componente pode ter expirado ou é inválido
          if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({ content: 'Este botão ou menu não está mais ativo.', ephemeral: true }).catch(() => {});
          }
          return;
        }

        // Envia a interação para o handler correto dentro do arquivo do comando
        if (interaction.isButton() && typeof command.handleButton === 'function') {
          await command.handleButton(interaction);
        } else if (interaction.isStringSelectMenu() && typeof command.handleSelectMenu === 'function') {
          await command.handleSelectMenu(interaction);
        } else if (interaction.isChannelSelectMenu() && typeof command.handleChannelSelect === 'function') {
          await command.handleChannelSelect(interaction);
        } else if (interaction.isModalSubmit() && typeof command.handleModal === 'function') {
          await command.handleModal(interaction);
        }
      }

    } catch (err) {
      error('Ocorreu um erro crítico ao processar uma interação:', err);
      
      const replyOptions = {
        content: '❌ Ocorreu um erro ao processar sua solicitação. A equipe já foi notificada.',
        ephemeral: true
      };
      
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(replyOptions).catch(e => error('Falha ao enviar followUp de erro.', e));
        } else {
          await interaction.reply(replyOptions).catch(e => error('Falha ao enviar reply de erro.', e));
        }
      } catch (replyError) {
        error('Falha crítica ao responder erro de interação:', replyError);
      }
    }
  },
};
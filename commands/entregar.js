const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { lerEstoque, removerItemDoEstoque, parseLinhaCartao } = require("../utils/estoque");
const { consultarCpf, gerarCpf } = require("../services/magmaapi");
const { logPagamento } = require("../utils/logger");

// Função para buscar um CPF válido, similar à do painel.js
async function buscarCpfValidoEmLoop(maxTentativas = 15) {
    for (let i = 0; i < maxTentativas; i++) {
        const cpf = gerarCpf();
        const resultado = await consultarCpf(cpf).catch(() => null);
        if (resultado && !resultado.error) return resultado;
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    return { error: 'NOT_FOUND_IN_LOOP' };
}

// Funções para identificar tipos de produto
function isAccountCategory(catName) {
    const upper = catName.toUpperCase();
    return upper.startsWith('STEAM') || upper.startsWith('ROBLOX');
}
function isGiftcardCategory(catName) {
    return catName.toUpperCase().includes('GIFTCARD');
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName("entregar")
        .setDescription("Entrega manualmente um cartão de uma categoria para um cliente.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(option =>
            option.setName('cliente')
                .setDescription('O cliente que receberá o produto.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('categoria')
                .setDescription('A categoria do cartão a ser entregue.')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        try {
            const estoque = lerEstoque();
            const categoriasDeCartoes = Object.keys(estoque).filter(cat => {
                const item = estoque[cat];
                return item && Array.isArray(item.cartoes) && item.cartoes.length > 0 && !isAccountCategory(cat) && !isGiftcardCategory(cat);
            });

            const focusedValue = interaction.options.getFocused().toLowerCase();
            const filteredChoices = categoriasDeCartoes
                .filter(choice => choice.toLowerCase().startsWith(focusedValue))
                .slice(0, 25);

            await interaction.respond(
                filteredChoices.map(choice => ({ name: choice, value: choice })),
            );
        } catch (error) {
            console.error('Erro no autocomplete de /entregar:', error);
        }
    },

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const cliente = interaction.options.getUser('cliente');
        const categoria = interaction.options.getString('categoria');
        const admin = interaction.user;

        try {
            const estoque = lerEstoque();

            if (!estoque[categoria] || !Array.isArray(estoque[categoria].cartoes) || estoque[categoria].cartoes.length === 0) {
                return interaction.editReply({ content: `❌ A categoria **${categoria}** não existe ou está sem estoque de cartões.` });
            }

            const cartaoLinha = estoque[categoria].cartoes[0];
            const cartaoInfo = parseLinhaCartao(cartaoLinha);
            const numeroDoCartao = cartaoInfo.numero;

            removerItemDoEstoque('cartao', categoria, numeroDoCartao);

            const resultadoApi = await buscarCpfValidoEmLoop(15);
            if (resultadoApi.error) {
                await logPagamento(interaction.client, 'erro', admin, { motivo: `API de consulta falhou durante entrega manual para ${cliente.tag}.` });
                return interaction.editReply({ content: '❌ Falha ao consultar os dados na API. O cartão foi removido do estoque, mas a entrega falhou. Verifique o console.' });
            }

            const dadosFinais = { ...cartaoInfo, ...resultadoApi };

            const prazoDeTrocaTimestamp = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);
            const deliveryMessage = `> Compra aprovada! ✅\n\n` +
                `**Seu cartão:**\n\`\`\`${dadosFinais.numero}|${dadosFinais.mes}/${dadosFinais.ano}|${dadosFinais.cvv}\`\`\`\n` +
                `**Nome:** \`${dadosFinais.nome}\`\n` +
                `**CPF:** \`${dadosFinais.cpf}\`\n` +
                `**Data de Nasc.:** \`${dadosFinais.nascimento || 'N/D'}\`\n` +
                `**Nome da Mãe:** \`${dadosFinais.mae || 'N/D'}\`\n\n` +
                `**Detalhes:** ${dadosFinais.bandeira}, ${dadosFinais.banco}, ${dadosFinais.level}.\n\n` +
                `> ⚠️ **Atenção:** Você tem até <t:${prazoDeTrocaTimestamp}:F> (<t:${prazoDeTrocaTimestamp}:R>) para solicitar a troca do cartão, caso ele não funcione.`;
            
            const logMessage = await logPagamento(
                interaction.client,
                'entrega_manual',
                cliente,
                {
                    categoria: categoria,
                    item: `${dadosFinais.numero}|${dadosFinais.mes}/${dadosFinais.ano}|${dadosFinais.cvv}`,
                    motivo: `Realizada pelo Admin: ${admin.tag}`
                }
            );

            const adminConfirmEmbed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle("✅ Relatório de Entrega Manual")
                .setAuthor({ name: `Admin: ${admin.tag}`, iconURL: admin.displayAvatarURL()})
                .setThumbnail(cliente.displayAvatarURL())
                .addFields(
                    { name: "Cliente", value: `${cliente.tag} (${cliente.id})`},
                    { name: "Produto Entregue", value: `Cartão da Categoria **${categoria}**` },
                    { name: "BIN", value: `\`${dadosFinais.numero.slice(0, 6)}\``, inline: true },
                    { name: "Level", value: dadosFinais.level, inline: true },
                    { name: "Banco", value: dadosFinais.banco, inline: true },
                    { name: "Status", value: "✔️ Item removido do estoque.", inline: false }
                )
                .setTimestamp();
            
            // --- LÓGICA DE CRIAÇÃO DOS BOTÕES CORRIGIDA ---
            const components = [];
            if (logMessage?.url) {
                const actionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel("Ver Registro Detalhado")
                        .setStyle(ButtonStyle.Link)
                        .setURL(logMessage.url)
                        .setEmoji("📜")
                );
                components.push(actionRow);
            }

            try {
                await cliente.send({ content: deliveryMessage });
                adminConfirmEmbed.addFields({ name: "Entrega na DM", value: "✅ Sucesso!", inline: true});
            } catch (dmError) {
                adminConfirmEmbed
                    .setColor(Colors.Orange)
                    .addFields({ name: "Entrega na DM", value: "❌ FALHOU! (DM fechada)", inline: true});
                
                const dmErrorEmbed = new EmbedBuilder()
                    .setColor(Colors.Orange)
                    .setTitle("⚠️ Falha ao Enviar DM")
                    .setDescription(`Não foi possível enviar a DM para ${cliente.tag}.\n\n**Copie a mensagem abaixo e envie para o cliente:**`)
                    .addFields({ name: "Mensagem de Entrega", value: deliveryMessage });

                // Envia os embeds de confirmação e erro para o admin
                await interaction.editReply({ embeds: [adminConfirmEmbed, dmErrorEmbed], components: components });
                return; 
            }
            
            // Envia apenas o embed de confirmação para o admin
            await interaction.editReply({ embeds: [adminConfirmEmbed], components: components });

        } catch (error) {
            console.error("Erro no comando /entregar:", error);
            await interaction.editReply({ content: '❌ Ocorreu um erro inesperado ao executar este comando.' });
        }
    }
};
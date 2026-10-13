/* ========================================================
   CONTROLE DE ORDEM DE SERVIÇO - SISS
   Script da Página Pública (publico.js)
   Decodifica parâmetros Base64 via TextDecoder
   e exibe a OS em modo somente-leitura.
   ======================================================== */

(function () {
    'use strict';

    const container = document.getElementById('container-publico');

    // Escapa HTML para prevenir XSS
    function escapar(str) {
        if (str === null || str === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    // Formata data ISO para pt-BR
    function formatarDataHora(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        }) + ' ' + d.toLocaleTimeString('pt-BR', {
            hour: '2-digit', minute: '2-digit'
        });
    }

    // Retorna classe CSS do tipo
    function obterClasseTipoBadge(tipo) {
        if (tipo === 'Crítica') return 'badge-tipo-Critica';
        if (tipo === 'Prioridade Alta') return 'badge-tipo-Alta';
        if (tipo === 'Prioridade Média') return 'badge-tipo-Media';
        if (tipo === 'Melhoria') return 'badge-tipo-Melhoria';
        return '';
    }

    // Exibe mensagem de erro amigável
    function exibirErro(titulo, mensagem) {
        container.innerHTML = `
            <div class="publico-erro-container">
                <h2 class="publico-erro-titulo">${escapar(titulo)}</h2>
                <p class="publico-erro-subtitulo">${escapar(mensagem)}</p>
            </div>
        `;
    }

    // Renderiza a OS no modo somente leitura
    function renderizarOS(os) {
        const azureTxt = os.azure && os.azure.trim() ? '#' + escapar(os.azure.trim()) : '—';
        const moduloTxt = os.modulo && os.modulo.trim() ? escapar(os.modulo.trim()) : '<span class="texto-nao-informado">Não informado</span>';
        const versaoTxt = os.versao && os.versao.trim() ? escapar(os.versao.trim()) : '<span class="texto-nao-informado">Não informado</span>';
        const ambienteTxt = os.ambiente && os.ambiente.trim() ? escapar(os.ambiente.trim()) : '<span class="texto-nao-informado">Não informado</span>';
        const respTxt = os.responsavel && os.responsavel.trim() ? escapar(os.responsavel.trim()) : '<span class="texto-nao-informado">Não informado</span>';
        const classeTipo = obterClasseTipoBadge(os.tipo);

        // Monta tabela de histórico
        let htmlHistorico = '';
        if (Array.isArray(os.historico) && os.historico.length > 0) {
            htmlHistorico += `
                <div class="detalhes-historico-secao" style="margin-top:20px;">
                    <h3>Histórico de Status</h3>
                    <div class="tabela-container">
                        <table class="tabela-dados tabela-historico">
                            <thead>
                                <tr>
                                    <th scope="col">Etapa</th>
                                    <th scope="col">Data/Hora Entrada</th>
                                    <th scope="col">Tempo na Etapa</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            os.historico.forEach(item => {
                const classeLinha = item.atual ? 'class="etapa-atual"' : '';
                htmlHistorico += `
                    <tr ${classeLinha}>
                        <td>
                            <span class="badge badge-status-${escapar(item.status)}">${escapar(item.status)}</span>
                            ${item.atual ? ' <em>(No momento da geração)</em>' : ''}
                        </td>
                        <td>${formatarDataHora(item.dataHora)}</td>
                        <td>${escapar(item.tempo || '—')}</td>
                    </tr>
                `;
            });

            htmlHistorico += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <!-- Aviso obrigatório -->
            <div class="publico-aviso-momento">
                <span>ℹ️</span>
                <span>Este link mostra a situação da OS no momento em que foi gerado.</span>
            </div>

            <div class="detalhes-cabecalho">
                <h2>Ordem de Serviço ${azureTxt !== '—' ? azureTxt : ''}</h2>
                <span class="badge badge-status-${escapar(os.status)}">${escapar(os.status)}</span>
            </div>

            <div class="detalhes-corpo">
                <div class="detalhes-item col-dupla">
                    <span class="detalhes-label">Descrição</span>
                    <span class="detalhes-valor">${escapar(os.descricao)}</span>
                </div>
                <div class="detalhes-item">
                    <span class="detalhes-label">Nº Azure DevOps</span>
                    <span class="detalhes-valor"><strong>${azureTxt}</strong></span>
                </div>
                <div class="detalhes-item">
                    <span class="detalhes-label">Tipo / Prioridade</span>
                    <span class="detalhes-valor"><span class="badge ${classeTipo}">${escapar(os.tipo)}</span></span>
                </div>
                <div class="detalhes-item">
                    <span class="detalhes-label">Módulo</span>
                    <span class="detalhes-valor">${moduloTxt}</span>
                </div>
                <div class="detalhes-item">
                    <span class="detalhes-label">Versão</span>
                    <span class="detalhes-valor">${versaoTxt}</span>
                </div>
                <div class="detalhes-item">
                    <span class="detalhes-label">Ambiente</span>
                    <span class="detalhes-valor">${ambienteTxt}</span>
                </div>
                <div class="detalhes-item">
                    <span class="detalhes-label">Responsável</span>
                    <span class="detalhes-valor">${respTxt}</span>
                </div>
                <div class="detalhes-item col-dupla">
                    <span class="detalhes-label">Data e Hora de Abertura</span>
                    <span class="detalhes-valor">${formatarDataHora(os.dataAbertura)}</span>
                </div>
            </div>

            ${htmlHistorico}
        `;
    }

    // Inicialização da página
    try {
        const params = new URLSearchParams(window.location.search);
        const dadosCodificados = params.get('dados');

        if (!dadosCodificados) {
            exibirErro(
                'Link inválido ou sem dados',
                'Nenhum parâmetro de ordem de serviço foi encontrado neste link. Verifique se a URL foi copiada corretamente.'
            );
            return;
        }

        // Decodificação Base64 com suporte total a UTF-8 (acentos e caracteres especiais)
        const binario = atob(dadosCodificados);
        const bytes = new Uint8Array(binario.length);
        for (let i = 0; i < binario.length; i++) {
            bytes[i] = binario.charCodeAt(i);
        }
        const jsonTexto = new TextDecoder('utf-8').decode(bytes);
        const os = JSON.parse(jsonTexto);

        if (!os || typeof os !== 'object' || !os.descricao || !os.status) {
            exibirErro(
                'Dados corrompidos',
                'Os dados recebidos não correspondem a uma ordem de serviço válida.'
            );
            return;
        }

        // Atualiza o título da aba do navegador
        document.title = (os.azure ? `#${os.azure} - ` : '') + 'OS - Controle de Ordem de Serviço - SISS';

        renderizarOS(os);

    } catch (erro) {
        console.error('Erro ao processar dados da OS pública:', erro);
        exibirErro(
            'Não foi possível carregar a Ordem de Serviço',
            'Ocorreu uma falha ao decodificar os dados do link. O endereço pode estar incompleto ou expirado.'
        );
    }

})();

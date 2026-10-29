import type { Metadata } from "next";
import { Contact, LegalPage } from "../components/LegalPage";

export const metadata: Metadata = { title: "Política de Privacidade · StockTower" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade" updated="29 de outubro de 2026">
      <p>
        Esta política explica quais dados o StockTower usa, para quê e quais são os seus direitos, conforme a Lei Geral de
        Proteção de Dados (Lei 13.709/2018, LGPD).
      </p>

      <h2>1. Quais dados usamos</h2>
      <ul>
        <li>
          <b>Conta:</b> seu e-mail e, se você entrar com o Google, o nome e a foto públicos da sua conta Google. A senha é
          guardada pelo serviço de autenticação de forma criptografada; nós não temos acesso a ela.
        </li>
        <li>
          <b>O que você cadastra no app:</b> carteira de investimentos, alertas de preço, respostas do perfil de investidor,
          simulações e preferências. Sem conta, isso fica só no seu navegador; com conta, é copiado para o nosso banco de
          dados para aparecer em qualquer aparelho.
        </li>
        <li>
          <b>Imagens e perguntas enviadas à IA:</b> prints de carteira que você importa e as perguntas que faz ao assistente.
        </li>
        <li>
          <b>Dados técnicos:</b> endereço IP e registros de acesso, usados para segurança e para limitar abusos.
        </li>
      </ul>
      <p>Não pedimos CPF, dados bancários nem senha de corretora.</p>

      <h2>2. Para que usamos</h2>
      <ul>
        <li>Criar e manter sua conta e sincronizar seus dados entre aparelhos (execução do serviço que você pediu).</li>
        <li>Gerar as análises, explicações e respostas da IA que você solicita.</li>
        <li>Proteger o serviço contra fraude e uso abusivo (legítimo interesse).</li>
      </ul>
      <p>Não vendemos seus dados e não os usamos para publicidade.</p>

      <h2>3. Com quem compartilhamos</h2>
      <p>Somente com os fornecedores necessários para o app funcionar, que tratam os dados em nosso nome:</p>
      <ul>
        <li>Supabase (autenticação e banco de dados);</li>
        <li>Vercel e Render (hospedagem do site e da API);</li>
        <li>Anthropic (IA Claude), que recebe apenas o conteúdo necessário para responder a cada pedido;</li>
        <li>Google, quando você escolhe entrar com a conta Google.</li>
      </ul>
      <p>
        Alguns desses fornecedores ficam fora do Brasil. A transferência internacional segue as garantias previstas na LGPD.
      </p>

      <h2>4. Por quanto tempo guardamos</h2>
      <p>
        Os dados da conta ficam guardados enquanto ela existir. Ao excluir a conta, apagamos os dados vinculados a ela, exceto
        o que a lei obrigar a manter.
      </p>

      <h2>5. Seus direitos</h2>
      <p>
        Você pode pedir a qualquer momento: confirmação e acesso aos seus dados, correção, exclusão, portabilidade, informação
        sobre compartilhamento e revogação do consentimento. Escreva para <Contact />.
      </p>

      <h2>6. Armazenamento no navegador</h2>
      <p>
        O app usa o armazenamento local do navegador para guardar sua sessão e suas preferências. Não usamos cookies de
        rastreamento nem de anúncios.
      </p>

      <h2>7. Segurança</h2>
      <p>
        Usamos conexão criptografada (HTTPS), acesso ao banco restrito ao servidor e verificação da sessão em cada pedido.
        Nenhum sistema é totalmente imune; se houver um incidente relevante, avisaremos você e a ANPD.
      </p>

      <h2>8. Mudanças nesta política</h2>
      <p>Se esta política mudar, a data acima será atualizada e, em mudanças importantes, avisaremos no app.</p>

      <h2>9. Contato</h2>
      <p>
        Dúvidas ou pedidos sobre seus dados: <Contact />.
      </p>
    </LegalPage>
  );
}


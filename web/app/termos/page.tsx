import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage } from "../components/LegalPage";

export const metadata: Metadata = { title: "Termos de Uso · StockTower" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso" updated="29 de outubro de 2026">
      <p>Ao usar o StockTower, com ou sem conta, você concorda com estes termos.</p>

      <h2>1. O que é o StockTower</h2>
      <p>
        Uma ferramenta de informação e educação sobre investimentos: cotações, rankings estatísticos, simulações, dados
        macroeconômicos e explicações geradas por inteligência artificial.
      </p>

      <h2>2. Não é recomendação de investimento</h2>
      <ul>
        <li>
          O conteúdo do app tem caráter informativo e educativo. Ele não é oferta, recomendação nem consultoria de
          investimento, nos termos das normas da CVM.
        </li>
        <li>
          Rankings, probabilidades e simulações usam dados do passado. Rentabilidade passada não garante rentabilidade
          futura, e o pior caso do passado pode ser superado.
        </li>
        <li>
          As respostas da IA podem conter erros. Confira as informações importantes e, se precisar de orientação
          personalizada, procure um profissional certificado.
        </li>
        <li>As decisões de investimento e os resultados delas são de responsabilidade de quem investe.</li>
      </ul>

      <h2>3. Dados de mercado</h2>
      <p>
        As cotações podem ter atraso e vêm de fontes de terceiros. Não garantimos que estejam completas, corretas ou sempre
        disponíveis.
      </p>

      <h2>4. Sua conta</h2>
      <ul>
        <li>Você é responsável por manter seu e-mail e sua senha seguros.</li>
        <li>Use um e-mail que seja seu e informações verdadeiras.</li>
        <li>Você pode deixar de usar o app e pedir a exclusão da conta a qualquer momento.</li>
      </ul>

      <h2>5. Uso permitido</h2>
      <p>
        Não é permitido tentar invadir o sistema, sobrecarregar a API com robôs, copiar o serviço em massa ou usá-lo para
        atividades ilegais. Podemos suspender contas que fizerem isso.
      </p>

      <h2>6. Disponibilidade e mudanças</h2>
      <p>
        O app é oferecido como está e pode ficar fora do ar, mudar ou ter funções retiradas. Estes termos também podem mudar;
        a data acima indica a versão em vigor.
      </p>

      <h2>7. Responsabilidade</h2>
      <p>
        Na medida permitida pela lei, o StockTower não responde por perdas financeiras decorrentes de decisões tomadas com
        base nas informações do app.
      </p>

      <h2>8. Privacidade</h2>
      <p>
        O uso dos seus dados está descrito na{" "}
        <Link href="/privacidade" className="font-semibold underline">
          Política de Privacidade
        </Link>
        .
      </p>

      <h2>9. Lei e contato</h2>
      <p>
        Estes termos seguem a lei brasileira. Dúvidas: <Contact />.
      </p>
    </LegalPage>
  );
}


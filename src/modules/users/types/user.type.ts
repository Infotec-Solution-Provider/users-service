export interface User {
    CODIGO: number;
    ATIVO: 'SIM' | 'NAO' | null;
    NOME: string;
    LOGIN: string;
    EMAIl: string;
    NIVEL: 'ATIVO' | 'RECEP' | 'AMBOS' | 'ADMIN' | null;
    HORARIO: number;
    DATACAD: Date | null;
    SETOR: number;
    NOME_EXIBICAO: string | null;
    CODIGO_ERP: string;
    SETOR_NOME: string;
    SENHA?: string | null;
    EXPIRA_EM: Date | null;
    ALTERA_SENHA: 'SIM' | 'NAO' | null;
    EDITA_CONTATOS: 'SIM' | 'NAO' | null;
    VISUALIZA_COMPRAS: 'SIM' | 'NAO' | null;
    CADASTRO: 'TOTAL' | 'NULOS' | null;
    LOGADO: number | null;
    ULTIMO_LOGIN_INI: Date | null;
    ULTIMO_LOGIN_FIM: Date | null;
    CODTELEFONIA: string;
    AGENDA_LIG: 'SIM' | 'NAO';
    LIGA_REPRESENTANTE: 'SIM' | 'NAO';
    BANCO: string;
    FILTRA_DDD: 'SIM' | 'NAO';
    FILTRA_ESTADO: 'SIM' | 'NAO';
    ASTERISK_RAMAL: string | null;
    ASTERISK_USERID: string | null;
    ASTERISK_LOGIN: string | null;
    ASTERISK_SENHA: string | null;
    CODEC: string | null;
    ASSINATURA_EMAIL: string | null; // VARCHAR 255
    LIGA_REPRESENTANTE_DIAS: number | null;
    EMAILOPERADOR: string | null; // VARCHAR(100)
    SENHAEMAILOPERADOR: string | null; // CHAR(30)
    EMAIL_EXIBICAO: string | null; // VARCHAR(40)
    limite_diario_agendamento: number | null;
    OMNI: number | null;
    CAMINHO_DATABASE: string | null;
    IDCAMPANHA_WEON: string | null;
}
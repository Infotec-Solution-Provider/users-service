import { User } from "../users/types/User.type";
declare class AuthService {
    private static secretKey;
    static login(clientName: string, LOGIN: string, SENHA: string): Promise<{
        token: string;
        user: User;
    }>;
    static recoverSession(clientName: string, token: string): Promise<User>;
}
export default AuthService;

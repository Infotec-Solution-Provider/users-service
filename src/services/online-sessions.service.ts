import { SessionData } from "@in.pulse-crm/sdk";
import authService from "./auth.service";

class UserSessions {
  constructor(
    public readonly data: SessionData,
    public isPaused: boolean,
    public onlineTokens: string[] = []
  ) {}

  public isOnline() {
    return this.onlineTokens.length > 0;
  }

  public addToken(token: string) {
    if (!this.onlineTokens.includes(token)) {
      this.onlineTokens.push(token);
    }
  }

  public removeToken(token: string) {
    this.onlineTokens = this.onlineTokens.filter((t) => t !== token);
  }
}

class OnlineSessionsService {
  private sessions = new Map<string, Array<UserSessions>>();

  public getSessionsByInstance(instance: string) {
    let sessions = this.sessions.get(instance);

    if (!sessions) {
      sessions = [];
      this.sessions.set(instance, sessions);
    }

    return sessions;
  }

  public async addTokenToSession(token: string) {
    const sessionData = await authService.recoverSessionData(token);
    const sessions = this.getSessionsByInstance(sessionData.instance);

    let userSessions = sessions.find(
      (s) => s.data.userId === sessionData.userId
    );

    if (!userSessions) {
      userSessions = new UserSessions(sessionData, false, []);
      sessions.unshift(userSessions);
    }

    userSessions.addToken(token);
  }

  public async removeTokenFromSession(token: string) {
    const sessionData = await authService.recoverSessionData(token);
    const sessions = this.getSessionsByInstance(sessionData.instance);
    const userSessions = sessions.find((s) => s.onlineTokens.includes(token));

    if (userSessions) {
      userSessions.removeToken(token);
    }
  }
}

export default new OnlineSessionsService();

// Beta-only Minecraft sign-in simulation. The live site uses "Sign in with Microsoft"
// (server/msAuth.ts): Microsoft OAuth → Xbox Live → Minecraft profile, the same chain the
// official launcher uses. In beta the code is generated in the browser and shown on screen.

export interface Challenge {
  mcName: string;
  code: string;
  expiresAt: number;
}

export interface MinecraftAuth {
  readonly mode: 'beta' | 'live';
  start(mcName: string): Promise<Challenge>;
  verify(challenge: Challenge, enteredCode: string): Promise<boolean>;
}

export const betaAuth: MinecraftAuth = {
  mode: 'beta',
  async start(mcName) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    return { mcName, code, expiresAt: Date.now() + 5 * 60_000 };
  },
  async verify(challenge, entered) {
    return Date.now() < challenge.expiresAt && entered.replace(/\D/g, '') === challenge.code;
  },
};

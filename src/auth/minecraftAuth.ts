// Minecraft sign-in.
//
// Planned for release: the "join a server, get a code" method. The player joins a small
// verification server (separate from the SMP, so nothing is installed on the SMP itself);
// Mojang's session check proves they own the account; the server kicks them with a 6-digit
// code; they type the code here. The site only ever learns username + UUID, never a password
// or email. Open-source implementation to self-host: https://github.com/Andcool-Systems/mc-oauth-rs
//
// Beta: the same screens, but the code is generated in the browser and shown on screen,
// because during beta only the site owner uses the site.

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

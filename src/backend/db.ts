import { AsyncDatabase } from "promised-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { HashedPassword } from "./auth";

export interface User {
  id: number;
  email: string;
  hashedPassword: HashedPassword;
  agreeToTerms: boolean;
}

export interface UserDto extends Omit<User, "hashedPassword"> {
  hashedPassword: string;
}

export interface UserRepository {
  create(user: User): Promise<User>;
  findByEmail(email: string): Promise<User | undefined>;
  get(userId: number): Promise<User | undefined>;
}

export class sqliteUserRepository implements UserRepository {
  constructor(private readonly db: AsyncDatabase) {}
  async create(user: User): Promise<User> {
    const userId: { id: number } = await this.db.get(
      "INSERT INTO users (email, hashedPassword, agreeToTerms) VALUES (?, ? , ?) RETURNING ID",
      [user.email, user.hashedPassword.hashed, user.agreeToTerms]
    );
    return { ...user, id: userId.id };
  }
  async findByEmail(email: string): Promise<User | undefined> {
    const userId: { id: number } | undefined = await this.db.get(
      "SELECT * FROM users WHERE email = ?",
      email
    );
    if (userId !== undefined) {
      return await this.get(userId.id);
    } else {
      return undefined;
    }
  }
  async get(userId: number): Promise<User | undefined> {
    const user: UserDto | undefined = await this.db.get(
      "SELECT * FROM users WHERE id = ?",
      userId
    );
    if (user !== undefined) {
      return {
        ...user,
        hashedPassword: new HashedPassword(user.hashedPassword),
      };
    } else {
      return undefined;
    }
  }
}

export class SqlliteSession {
  constructor(private readonly db: AsyncDatabase) {}

  async create(userId: number): Promise<string> {
    const sessionId = uuidv4();
    await this.db.run(
      "INSERT INTO sessions (session_id, user_id) VALUES (?,?)",
      [sessionId, userId]
    );
    return sessionId;
  }

  async get(sessionId: string): Promise<User | undefined> {
    const userId: { user_id: number } | undefined = await this.db.get(
      "SELECT user_id FROM sessions WHERE session_id = ?",
      sessionId
    );
    if (userId === undefined) {
      return undefined;
    }
    const users = new sqliteUserRepository(this.db);
    return await users.get(userId.user_id);
  }
}

export async function connect(
  connectionString: string
): Promise<AsyncDatabase> {
  return await AsyncDatabase.open(connectionString);
}

export async function newDb(db: AsyncDatabase): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        hashedPassword TEXT NOT NULL,
        agreeToTerms BOOLEAN NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
        session_id UUID PRIMARY KEY,
        user_id INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

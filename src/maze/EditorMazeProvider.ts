import type { MazeData, MazeProvider } from './types';
import { JsonMazeProvider } from './JsonMazeProvider';

// Wraps a JsonMazeProvider with a user-editable overlay. Custom levels take
// precedence on load; list() exposes custom ids first so editors and the
// level-select UI can show the user's own creations at the top.
export class EditorMazeProvider implements MazeProvider {
  constructor(
    private custom: Record<string, MazeData>,
    private fallback: JsonMazeProvider,
  ) {}

  async load(id: string): Promise<MazeData> {
    // The Record<string, MazeData> type signature is the contract: callers
    // must hand us validated data. We return it as-is; a broken entry only
    // poisons its own id, not the fallback for other ids.
    const customEntry = this.custom[id];
    if (customEntry !== undefined) return customEntry;
    return this.fallback.load(id);
  }

  async list(): Promise<string[]> {
    return [...Object.keys(this.custom), ...(await this.fallback.list())];
  }
}

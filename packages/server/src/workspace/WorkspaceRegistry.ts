/**
 * Maps every open document to the project root that owns it, so one window
 * holding several projects resolves each file against its own docs root.
 * @docs server.md#workspaces
 */

import * as nodePath from 'node:path';
import { CONFIG_FILE_NAME, DEFAULT_CONFIG } from '@docsmirror/core';
import type { DocsMirrorSettings } from '../settings';
import { contains, uriToPath } from './paths';
import { ProjectRootFinder } from './projectRoot';
import { Workspace } from './Workspace';

export class WorkspaceRegistry {
  private readonly workspaces = new Map<string, Workspace>();
  /** The folders the client opened. They bound the search, and nothing else. */
  private folders: string[] = [];
  private settings: DocsMirrorSettings;
  private fallbackPath: string;
  private finder: ProjectRootFinder;

  constructor(settings: DocsMirrorSettings, fallbackPath: string) {
    this.settings = settings;
    this.fallbackPath = nodePath.resolve(fallbackPath);
    this.finder = new ProjectRootFinder(settings.docsRoot ?? DEFAULT_CONFIG.docsRoot);
  }

  /** Replaces the known folders, keeping the fallback root as a last resort. */
  async setFolders(folderPaths: readonly string[]): Promise<void> {
    const wanted = folderPaths.map((folder) => nodePath.resolve(folder));
    this.folders = wanted;
    const keep = new Set(wanted);
    for (const known of [...this.workspaces.keys()]) {
      if (!keep.has(known) && known !== this.fallbackPath) {
        this.workspaces.delete(known);
      }
    }
    this.finder.clear();
    for (const folder of wanted) {
      await this.load(folder);
    }
  }

  async addFolders(folderPaths: readonly string[]): Promise<void> {
    for (const folder of folderPaths) {
      const resolved = nodePath.resolve(folder);
      if (!this.folders.includes(resolved)) {
        this.folders.push(resolved);
      }
      await this.load(resolved);
    }
    this.finder.clear();
  }

  removeFolders(folderPaths: readonly string[]): void {
    for (const folder of folderPaths) {
      const resolved = nodePath.resolve(folder);
      this.folders = this.folders.filter((known) => known !== resolved);
      this.workspaces.delete(resolved);
    }
    this.finder.clear();
  }

  /** Reloads every workspace against new settings. */
  async applySettings(settings: DocsMirrorSettings): Promise<void> {
    this.settings = settings;
    this.finder.clear(settings.docsRoot ?? DEFAULT_CONFIG.docsRoot);
    for (const rootPath of [...this.workspaces.keys()]) {
      this.workspaces.delete(rootPath);
      await this.load(rootPath);
    }
  }

  /**
   * The deepest folder the client opened that holds this file. It is the floor
   * of the search, so a project is never looked for outside the window.
   */
  private boundaryFor(filePath: string): string {
    let best: string | undefined;
    for (const folder of this.folders) {
      if (contains(folder, filePath) && (best === undefined || folder.length > best.length)) {
        best = folder;
      }
    }
    return best ?? this.fallbackPath;
  }

  /** The workspace owning a document, found by walking up from the file itself. */
  async forUri(uri: string): Promise<Workspace | undefined> {
    const filePath = uriToPath(uri);
    if (filePath === undefined) {
      return undefined;
    }
    return this.load(await this.finder.find(filePath, this.boundaryFor(filePath)));
  }

  /**
   * Reacts to a file the client watched for us. A configuration file rebuilds
   * its workspace; any other file only drops the cached document.
   */
  async fileChanged(filePath: string): Promise<void> {
    if (nodePath.basename(filePath) === CONFIG_FILE_NAME) {
      // A configuration file appearing or vanishing changes who owns what.
      this.finder.clear();
      const owner = nodePath.dirname(nodePath.resolve(filePath));
      this.workspaces.delete(owner);
      await this.load(owner);
      return;
    }
    for (const [rootPath, workspace] of [...this.workspaces.entries()]) {
      // A root that did not exist may have just been created by this very file.
      if (!workspace.docsRootExists) {
        this.workspaces.delete(rootPath);
        this.finder.clear();
        continue;
      }
      workspace.invalidate(filePath);
    }
  }

  private async load(rootPath: string): Promise<Workspace> {
    const existing = this.workspaces.get(rootPath);
    if (existing !== undefined) {
      return existing;
    }
    const workspace = await Workspace.create(rootPath, this.settings);
    this.workspaces.set(rootPath, workspace);
    return workspace;
  }
}

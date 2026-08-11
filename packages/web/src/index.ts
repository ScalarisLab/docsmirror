/**
 * DocsMirror web, a local app for reading and editing a repository's own
 * documentation. It serves files from disk, writes them back, and never talks
 * to anything but the machine it runs on.
 *
 * The public surface is the server and the project behind it; everything else
 * in this package is an implementation detail of those two.
 * @docs architecture.md#packages
 */

export { startDocsServer } from './server';
export type { DocsServer, DocsServerOptions } from './server';

export { DocsProject } from './project';

const { ConstructLibraryCdk8s } = require('projen');

const project = new ConstructLibraryCdk8s({
  author: 'Hunter Thompson',
  authorAddress: 'aatman@auroville.org.in',
  description: 'Replicated, password protected redis cluster setup.',
  defaultReleaseBranch: 'main',
  name: 'cdk8s-redis-cluster',
  stability: 'experimental',
  repositoryUrl: 'https://github.com/opencdk8s/cdk8s-redis-cluster.git',

  cdk8sVersion: '1.2.1',
  constructsVersion: '3.3.161',
  githubOptions: {
    mergify: true,
  },

  gitignore: [
    '*tags*',
  ],

  publishToGo: {
    moduleName: 'github.com/opencdk8s/cdk8s-redis-cluster-go',
  },

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
  // release: undefined,      /* Add release management to this project. */
});
project.synth();

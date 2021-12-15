import { Chart, Testing } from 'cdk8s';
import { Redis } from '../src';

test('with cm', () => {
  const app = Testing.app();
  const chart = new Chart(app, 'test', {
    namespace: 'test',
  });

  new Redis(chart, 'asd-redis', {
    volumeSize: '10Gi',
    redisPassword: 'test',
  });

  expect(Testing.synth(chart)).toMatchSnapshot();
});

test('with values', () => {
  const app = Testing.app();
  const chart = new Chart(app, 'test', {
    namespace: 'test',
  });

  new Redis(chart, 'asdasd-redis', {
    volumeSize: '10Gi',
    replicas: 2,
    volumeFsType: 'ext3',
    volumeType: 'io1',
    volumeIopsPerGb: '100',
    redisImage: 'test-image',
    redisPassword: 'test2',
    enableAof: 'no',
    nodeSelector: {
      test: 'test',
    },
    namespace: 'test',
    tolerations: [
      {
        key: 'test',
        operator: 'Equal',
        value: 'test',
      },
    ],
  });

  expect(Testing.synth(chart)).toMatchSnapshot();
});

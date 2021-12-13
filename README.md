# cdk8s-redis-cluster

Replicated, password protected redis cluster statefulset setup. Uses Bitnamis redis-cluster helm chart as a reference.

## Example

```
  new Redis(chart, 'redis', {
    volumeSize: '10Gi',
    replicas: 6,
    volumeFsType: 'ext4',
    volumeType: 'io1',
    volumeIopsPerGb: '100',
    redisImage: 'test-image',
    redisPassword: 'helloworld', // get from aws secrets manager
    nodeSelector: {
      test: 'test',
    },
    tolerations: [
      {
        key: 'test',
        operator: 'Equal',
        value: 'test',
      },
    ],
  });
```

## [`API.md`](API.md)



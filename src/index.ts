import { Construct } from 'constructs';
import * as k8s from './imports/k8s';
import { makeCM } from './redis-cm';

export * from './imports/k8s';

export interface RedisOptions {
  /**
    * The number of replicas for the sts.
    * @default 3
  */
  readonly replicas?: number;
  /**
   * The redis image to use
   * @default docker.io/bitnami/redis-cluster:6.2.6-debian-10-r49
   */
  readonly redisImage?: string;
  /**
   * The size of volume to use
   */
  readonly volumeSize: string;
  /**
    * The volumeType - gp2/gp3/io1/io2 etc
    * @default gp2
    */
  readonly volumeType?: string;
  /**
    * The volumeIops per GB
    * @default 3
    */
  readonly volumeIopsPerGb?: string;
  /**
    * The volume FS Type - ext4/ext3/xfs etc
    * @default ext4
    */
  readonly volumeFsType?: string;
  /**
   * The redis password
   * Has to be base64 encoded, a way you can securely get a password is by using AWS Secrets Manager
   */
  readonly redisPassword: string;
  /**
   * Node Selectors
   * @default undefined
   */
  readonly nodeSelector?: { [key: string]: string };
  /**
   * Tolerations
   * @default undefined
   */
  readonly tolerations?: k8s.Toleration[];
  /**
   * The namespace to deploy the sts to
   * @default default
   */
  readonly namespace?: string;
  /**
   * Resource Quantity
   * @default undefined
   */
  readonly resourceQuantity?: k8s.ResourceRequirements;
  /**
   * Append to redis config
   * @default undefined
   */
  readonly redisConfig?: string[];
  /**
   * Enable AOF
   * @default yes
   */
  readonly enableAof?: string;
  /**
   * Announce IPS to Redis
   * @default undefined
   */
  readonly announceIps?: string[];
  /**
   * Enable Kuma Service Mesh Dataplane injection
   * @default false
   */
  readonly kumaMesh?: boolean;
  /**
   * The Kuma Mesh name
   * @default undefined
   *
   */
  readonly kumaMeshName?: string;
  /**
   * Announce replica ip
   * @default undefined
   */
  readonly announceReplicaIp?: boolean;
}

export class Redis extends Construct {

  private getRedisNodes(replicas: number, name: string): string {
    var nodes: string[] = [];
    for (let i = 0; i < replicas; i++) {
      nodes.push(`${name}-${i}.${name}-headless`);
    }
    return nodes.join(' ');
  }

  constructor(scope: Construct, name: string, opts: RedisOptions) { // eslint-disable-line 
    super(scope, name);

    const ns = opts?.namespace ? opts.namespace : 'default';

    var a: string = '';

    if (opts?.announceIps) {
      const ips = opts.announceIps?.join(' ') ;
      a = `ips=($(echo "[${ips}]" | cut -d [ -f2 | cut -d ] -f 1))
     export REDIS_CLUSTER_ANNOUNCE_IP="\${ips[$pod_index]}"
     export REDIS_NODES="\${ips[@]}"`;

    }

    var b: string = '';

    if (opts?.announceReplicaIp) {
      b = 'echo "replica-announce-ip $POD_IP" >> /opt/bitnami/redis/etc/redis.conf';
    }


    const storageClass = new k8s.KubeStorageClass(this, 'storageClass', {
      metadata: {
        name: name,
      },
      provisioner: 'kubernetes.io/aws-ebs',
      parameters: {
        type: opts?.volumeType ?? 'gp2',
        iopsPerGB: opts?.volumeIopsPerGb ?? '3',
        fsType: opts.volumeFsType ?? 'ext4',
      },
    });


    new k8s.KubeSecret(this, 'secret', {
      metadata: {
        name: name,
        labels: {
          app: name,
        },
      },
      type: 'Opaque',
      data: {
        'redis-password': opts.redisPassword,
      },
    });

    const dcm = new k8s.KubeConfigMap(this, 'default-cm', {
      metadata: {
        name: `${name}-default`,
        labels: {
          app: name,
        },
      },
      data: {
        'redis-default.conf': makeCM(opts.redisConfig),
      },
    });

    const scm = new k8s.KubeConfigMap(this, 'scripts-cm', {
      metadata: {
        name: `${name}-scripts`,
        labels: {
          app: name,
        },
      },
      data: {
        'ping_readiness_local.sh': `#!/bin/sh
    set -e

    REDIS_STATUS_FILE=/tmp/.redis_cluster_check
    if [ ! -z "$REDIS_PASSWORD" ]; then export REDISCLI_AUTH=$REDIS_PASSWORD; fi;
    response=$(
      timeout -s 3 $1 \
      redis-cli \
        -h localhost \
        -p $REDIS_PORT \
        ping
    )
    if [ "$response" != "PONG" ]; then
      echo "$response"
      exit 1
    fi
    if [ ! -f "$REDIS_STATUS_FILE" ]; then
      response=$(
        timeout -s 3 $1 \
        redis-cli \
          -h localhost \
          -p $REDIS_PORT \
          CLUSTER INFO | grep cluster_state | tr -d '[:space:]'
      )
      if [ "$response" != "cluster_state:ok" ]; then
        echo "$response"
        exit 1
      else
        touch "$REDIS_STATUS_FILE"
      fi
    fi`,
        'ping_liveness_local.sh': `if [ ! -z "$REDIS_PASSWORD" ]; then export REDISCLI_AUTH=$REDIS_PASSWORD; fi;
    response=$(
      timeout -s 3 $1 \
      redis-cli \
        -h localhost \
        -p $REDIS_PORT \
        ping
    )
    if [ "$response" != "PONG" ] && [ "$response" != "LOADING Redis is loading the dataset in memory" ]; then
      echo "$response"
      exit 1
    fi`,
      },
    });

    const replicas = opts?.replicas ?? 3;

    const hsvc = new k8s.KubeService(this, 'svc-headless', {
      metadata: {
        name: `${name}-headless`,
        labels: {
          app: name,
        },
      },
      spec: {
        type: 'ClusterIP',
        clusterIp: 'None',
        publishNotReadyAddresses: true,
        ports: [
          {
            name: 'tcp-redis',
            port: 6379,
            targetPort: k8s.IntOrString.fromString('tcp-redis'),
          },
          {
            name: 'tcp-redis-bus',
            port: 16379,
            targetPort: k8s.IntOrString.fromString('tcp-redis-bus'),
          },
        ],
        selector: {
          app: name,
        },
      },
    });

    new k8s.KubeService(this, 'svc-cluster', {
      metadata: {
        name: name,
        labels: {
          app: name,
        },
        annotations: undefined,
      },
      spec: {
        type: 'ClusterIP',
        ports: [{
          name: 'tcp-redis',
          port: 6379,
          targetPort: k8s.IntOrString.fromString('tcp-redis'),
          protocol: 'TCP',
        }],
        selector: {
          app: name,
        },
      },
    });

    new k8s.KubeStatefulSet(this, 'sts', {
      metadata: {
        name: name,
        labels: {
          app: name,
        },
      },
      spec: {
        updateStrategy: {
          rollingUpdate: {
            partition: 0,
          },
          type: 'RollingUpdate',
        },
        selector: {
          matchLabels: {
            app: name,
          },
        },
        replicas: replicas,
        serviceName: hsvc.name,
        podManagementPolicy: 'Parallel',
        template: {
          metadata: {
            annotations: opts?.kumaMesh && opts?.kumaMeshName ? {
              'kuma.io/sidecar-injection': 'enabled',
              'kuma.io/mesh': opts?.kumaMeshName,
            } : {
              'kuma.io/sidecar-injection': 'disabled',
            },
            labels: {
              app: name,
            },
          },
          spec: {
            securityContext: {
              fsGroup: 1001,
              runAsUser: 1001,
              sysctls: [],
            },
            serviceAccountName: 'default',
            affinity: {
              podAntiAffinity: {
                preferredDuringSchedulingIgnoredDuringExecution: [{
                  podAffinityTerm: {
                    labelSelector: {
                      matchLabels: {
                        app: name,
                      },
                    },
                    namespaces: [ns],
                    topologyKey: 'kubernetes.io/hostname',
                  },
                  weight: 1,
                }],
              },
            },
            containers: [{
              name: name,
              image: opts?.redisImage ? opts.redisImage : 'docker.io/bitnami/redis-cluster:6.2.6-debian-10-r49',
              imagePullPolicy: 'IfNotPresent',
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 1001,
              },
              command: [
                '/bin/bash',
                '-c',
              ],
              args: [`# Backwards compatibility change
              if ! [[ -f /opt/bitnami/redis/etc/redis.conf ]]; then
                  echo COPYING FILE
                  cp  /opt/bitnami/redis/etc/redis-default.conf /opt/bitnami/redis/etc/redis.conf
              fi
              ${a}
              pod_index=($(echo "$POD_NAME" | tr "-" "\n"))
              pod_index="\${pod_index[-1]}"
              if [[ "$pod_index" == "0" ]]; then
                export REDIS_CLUSTER_CREATOR="yes"
                export REDIS_CLUSTER_REPLICAS="1"
              fi
              ${b}
              /opt/bitnami/scripts/redis-cluster/entrypoint.sh /opt/bitnami/scripts/redis-cluster/run.sh`],
              env: [
                {
                  name: 'POD_NAME',
                  valueFrom: {
                    fieldRef: {
                      fieldPath: 'metadata.name',
                    },
                  },
                },
                {
                  name: 'REDIS_NODES',
                  value: this.getRedisNodes(replicas, name),
                },
                {
                  name: 'REDISCLI_AUTH',
                  valueFrom: {
                    secretKeyRef: {
                      name: name,
                      key: 'redis-password',
                    },
                  },
                },
                {
                  name: 'REDIS_PASSWORD',
                  valueFrom: {
                    secretKeyRef: {
                      name: name,
                      key: 'redis-password',
                    },
                  },
                },
                {
                  name: 'REDIS_AOF_ENABLED',
                  value: opts?.enableAof ? opts.enableAof : 'yes',
                },
                {
                  name: 'REDIS_TLS_ENABLED',
                  value: 'no',
                },
                {
                  name: 'REDIS_PORT',
                  value: '6379',
                },
                {
                  name: 'POD_IP',
                  valueFrom: {
                    fieldRef: {
                      fieldPath: 'status.podIP',
                    },
                  },
                },
              ],
              ports: [
                {
                  name: 'tcp-redis',
                  containerPort: 6379,
                },
                {
                  name: 'tcp-redis-bus',
                  containerPort: 16379,
                },
              ],
              livenessProbe: {
                initialDelaySeconds: 5,
                periodSeconds: 5,
                timeoutSeconds: 6,
                successThreshold: 1,
                failureThreshold: 5,
                exec: {
                  command: [
                    'sh',
                    '-c',
                    '/scripts/ping_liveness_local.sh 5',
                  ],
                },
              },
              readinessProbe: {
                initialDelaySeconds: 5,
                periodSeconds: 5,
                timeoutSeconds: 2,
                successThreshold: 1,
                failureThreshold: 5,
                exec: {
                  command: [
                    'sh',
                    '-c',
                    '/scripts/ping_readiness_local.sh 1',
                  ],
                },
              },
              resources: opts.resourceQuantity,
              volumeMounts: [
                {
                  name: 'scripts',
                  mountPath: '/scripts',
                },
                {
                  name: 'redis-data',
                  mountPath: '/bitnami/redis/data',
                  subPath: undefined,
                },
                {
                  name: 'default-config',
                  mountPath: '/opt/bitnami/redis/etc/redis-default.conf',
                  subPath: 'redis-default.conf',
                },
                {
                  name: 'redis-tmp-conf',
                  mountPath: '/opt/bitnami/redis/etc/',
                },
              ],
            }],
            nodeSelector: opts.nodeSelector,
            tolerations: opts.tolerations,
            volumes: [
              {
                name: 'scripts',
                configMap: {
                  name: scm.name,
                  defaultMode: 0o755,
                },
              },
              {
                name: 'default-config',
                configMap: {
                  name: dcm.name,
                },
              },
              {
                name: 'redis-tmp-conf',
                emptyDir: {},
              },
            ],
          },
        },
        volumeClaimTemplates: [{
          metadata: {
            name: 'redis-data',
            labels: {
              app: name,
            },
          },
          spec: {
            accessModes: ['ReadWriteOnce'],
            resources: {
              requests: {
                storage: k8s.Quantity.fromString(opts.volumeSize),
              },
            },
            storageClassName: storageClass.name,
          },
        }],
      },
    });


  }
}

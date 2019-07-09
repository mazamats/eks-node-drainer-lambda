"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
exports.__esModule = true;
var k8s = require("@kubernetes/client-node");
var AWS = require("aws-sdk");
var signer = require("aws-signature-v4");
var base64url_1 = require("base64url");
var querystring = require("querystring");
module.exports.drain = function (event, context, callback) { return __awaiter(_this, void 0, void 0, function () {
    var instanceId, region, eksCluster, userToken, k8sApi, eksNodeName, pods, asg;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log(event);
                instanceId = event.detail.EC2InstanceId;
                region = event.region;
                return [4 /*yield*/, getEKSCluster(instanceId, region)];
            case 1:
                eksCluster = _a.sent();
                return [4 /*yield*/, getBearerToken(eksCluster.name)];
            case 2:
                userToken = _a.sent();
                k8sApi = getEKSClient(eksCluster.cluster.endpoint, eksCluster.cluster.certificateAuthority.data, userToken);
                return [4 /*yield*/, getEKSNodeName(instanceId, k8sApi, region)];
            case 3:
                eksNodeName = _a.sent();
                // cordon the node
                return [4 /*yield*/, k8sApi
                        .patchNode(eksNodeName, { spec: { unschedulable: true } }, undefined, undefined, {
                        headers: { "Content-Type": "application/merge-patch+json" }
                    })
                        .then(function (res) {
                        console.log("Successfully cordoned node " + res.body.metadata.name);
                    })["catch"](function (err) {
                        throw new Error("Failed to cordon node: " + err);
                    })];
            case 4:
                // cordon the node
                _a.sent();
                pods = {};
                return [4 /*yield*/, k8sApi
                        .listPodForAllNamespaces()
                        .then(function (res) {
                        res.body.items.filter(function (pod) {
                            if (pod.spec.nodeName === eksNodeName &&
                                pod.metadata.ownerReferences[0].kind !== "DaemonSet") {
                                pods[pod.metadata.name] = pod.metadata.namespace;
                            }
                        });
                    })["catch"](function (err) {
                        throw new Error("Failed to get list of pods: " + JSON.stringify(err));
                    })];
            case 5:
                _a.sent();
                _a.label = 6;
            case 6:
                if (!(Object.keys(pods).length !== 0)) return [3 /*break*/, 9];
                return [4 /*yield*/, Promise.all(Object.keys(pods).map(function (pod) {
                        k8sApi
                            .createNamespacedPodEviction(pod, pods[pod], {
                            metadata: { name: pod }
                        })
                            .then(function (eviction) {
                            console.log("Successfully evicted pod " + pod);
                            delete pods[pod];
                        })["catch"](function (err) {
                            if (err.response.body.details.causes[0].reason === "DisruptionBudget") {
                                console.log("Waiting to evict pod: " + err.response.body.details.causes[0].message);
                            }
                            else {
                                throw new Error("Failed to evict pod: " + JSON.stringify(err));
                            }
                        });
                    }))];
            case 7:
                _a.sent();
                // wait 15 seconds before attempting another eviction round
                console.log("Sleeping for 15 seconds before evicting the remaining pods");
                return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 15000); })];
            case 8:
                _a.sent();
                return [3 /*break*/, 6];
            case 9:
                // complete the asg lifecycle hook
                console.log("Completing ASG lifecycle action.");
                asg = new AWS.AutoScaling({ region: region });
                return [4 /*yield*/, asg
                        .completeLifecycleAction({
                        AutoScalingGroupName: event.detail.AutoScalingGroupName,
                        LifecycleActionResult: "CONTINUE",
                        LifecycleHookName: event.detail.LifecycleHookName,
                        LifecycleActionToken: event.detail.LifecycleActionToken
                    })
                        .promise()["catch"](function (err) {
                        throw new Error("Failed to complete lifecycle action: " + JSON.stringify(err));
                    })];
            case 10:
                _a.sent();
                console.log("ASG lifecycle action completed.");
                callback(null);
                return [2 /*return*/];
        }
    });
}); };
var getEKSNodeName = function (instanceId, k8sApi, region) { return __awaiter(_this, void 0, void 0, function () {
    var ec2, ec2Instances, ec2PrivateDNS, eksNodes, eksNode, eksNodeName;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                // filter ec2 nodes
                console.log("Getting data for EC2 instance: " + instanceId);
                ec2 = new AWS.EC2({ region: region });
                return [4 /*yield*/, ec2
                        .describeInstances({
                        InstanceIds: [instanceId]
                    })
                        .promise()["catch"](function (err) {
                        throw new Error("Failed to describe EC2 instances: " + JSON.stringify(err));
                    })];
            case 1:
                ec2Instances = _a.sent();
                ec2PrivateDNS = ec2Instances.Reservations[0].Instances[0].PrivateDnsName;
                console.log(JSON.stringify(ec2Instances));
                console.log("Found EC2 Instance: " + ec2PrivateDNS);
                return [4 /*yield*/, k8sApi.listNode()["catch"](function (err) {
                        throw new Error("Failed to list Kubernetes Nodes: " + JSON.stringify(err));
                    })];
            case 2:
                eksNodes = _a.sent();
                console.log("Found EKS Nodes: " + JSON.stringify(eksNodes));
                eksNode = eksNodes.body.items.find(function (node) {
                    return node.status.addresses.find(function (address) { return address.type === "InternalDNS"; })
                        .address === ec2PrivateDNS;
                });
                console.log("Filtered EKS Node: " + JSON.stringify(eksNode));
                eksNodeName = eksNode.metadata.name;
                console.log("Matched EC2 instance: " + ec2PrivateDNS + " with EKS node: " + eksNodeName);
                return [2 /*return*/, eksNode.metadata.name];
        }
    });
}); };
var getEKSCluster = function (instanceId, region) { return __awaiter(_this, void 0, void 0, function () {
    var ec2, eks, instanceTags, clusterTag, clusterName, eksCluster;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                ec2 = new AWS.EC2({ region: region });
                eks = new AWS.EKS({ region: region });
                instanceTags = [];
                console.log("Getting tags for instance: " + instanceId);
                return [4 /*yield*/, ec2
                        .describeTags({
                        Filters: [
                            {
                                Name: "resource-id",
                                Values: [instanceId]
                            }
                        ]
                    })
                        .promise()
                        .then(function (data) {
                        instanceTags = data.Tags;
                    })["catch"](function (err) {
                        throw new Error("Failed to get instance tags: " + JSON.stringify(err));
                    })];
            case 1:
                _a.sent();
                console.log("Found tags: " + JSON.stringify(instanceTags));
                clusterTag = instanceTags.find(function (tag) { return tag.Key.startsWith("kubernetes.io/cluster/") && tag.Value == "owned"; });
                console.log("K8S Cluster Tag: " + JSON.stringify(clusterTag));
                clusterName = clusterTag.Key.replace("kubernetes.io/cluster/", "");
                console.log("K8S Cluster Name: " + clusterName);
                return [4 /*yield*/, eks
                        .describeCluster({ name: clusterName })
                        .promise()["catch"](function (err) {
                        throw new Error("Failed to describe EKS cluster: " + JSON.stringify(err));
                    })];
            case 2:
                eksCluster = _a.sent();
                return [2 /*return*/, { name: clusterName, cluster: eksCluster.cluster }];
        }
    });
}); };
var getEKSClient = function (endpoint, caData, token) {
    var kubeconfig = {
        clusters: [
            {
                server: endpoint,
                caData: caData,
                name: "kubernetes",
                skipTLSVerify: false
            }
        ],
        contexts: [
            { cluster: "kubernetes", user: "aws", name: "aws", namespace: "default" }
        ],
        currentContext: "aws",
        users: [
            {
                name: "aws",
                token: token
            }
        ]
    };
    var kc = new k8s.KubeConfig();
    kc.loadFromOptions(kubeconfig);
    var k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    return k8sApi;
};
var getBearerToken = function (clusterId) { return __awaiter(_this, void 0, void 0, function () {
    var sts, awsCreds, _a, fullUrl, fullUrlBase64, token;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                sts = new AWS.STS();
                if (!process.env.AWS_ASSUME_ROLE_ARN) return [3 /*break*/, 2];
                return [4 /*yield*/, sts
                        .assumeRole({
                        RoleArn: process.env.AWS_ASSUME_ROLE_ARN,
                        RoleSessionName: "eks-lambda-node-drainer"
                    })
                        .promise()["catch"](function (err) {
                        throw new Error("Failed to assume AWS ROLE: " + process.env.AWS_ASSUME_ROLE_ARN + " " + JSON.stringify(err));
                    })];
            case 1:
                _a = _b.sent();
                return [3 /*break*/, 3];
            case 2:
                _a = { Credentials: {
                        AccessKeyId: AWS.config.credentials.accessKeyId,
                        SecretAccessKey: AWS.config.credentials.secretAccessKey,
                        SessionToken: AWS.config.credentials.sessionToken
                    } };
                _b.label = 3;
            case 3:
                awsCreds = _a;
                console.log("AWS_ACCESS_KEY_ID: " + awsCreds.Credentials.AccessKeyId);
                fullUrl = generatePresignedSTSURL({
                    key: awsCreds.Credentials.AccessKeyId,
                    secret: awsCreds.Credentials.SecretAccessKey,
                    sessionToken: awsCreds.Credentials.SessionToken,
                    expires: 60,
                    clusterId: clusterId
                });
                fullUrlBase64 = base64url_1["default"].encode(fullUrl);
                token = "k8s-aws-v1." + fullUrlBase64;
                return [2 /*return*/, token];
        }
    });
}); };
var generatePresignedSTSURL = function (options) {
    var region = options.region || "us-east-1";
    var datetime = Date.now();
    var host = options.region
        ? "sts." + options.region + ".amazonaws.com"
        : "sts.amazonaws.com";
    var headers = { "x-k8s-aws-id": options.clusterId, Host: host };
    var query = {
        Action: "GetCallerIdentity",
        Version: "2011-06-15",
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": options.key + "/" + signer.createCredentialScope(datetime, region, "sts"),
        "X-Amz-Date": new Date(datetime)
            .toISOString()
            .replace(/[:\-]|\.\d{3}/g, ""),
        "X-Amz-Expires": options.expires,
        "X-Amz-SignedHeaders": signer.createSignedHeaders(headers),
        "X-Amz-Security-Token": options.sessionToken
    };
    var canonicalRequest = signer.createCanonicalRequest("GET", "/", query, headers, "", true);
    var stringToSign = signer.createStringToSign(datetime, region, "sts", canonicalRequest);
    var signature = signer.createSignature(options.secret, datetime, region, "sts", stringToSign);
    query["X-Amz-Signature"] = signature;
    return "https://" + host + "/?" + querystring.stringify(query);
};

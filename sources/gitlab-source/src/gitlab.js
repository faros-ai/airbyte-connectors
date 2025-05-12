"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitLab = exports.DEFAULT_RUN_MODE = exports.DEFAULT_API_URL = exports.DEFAULT_FAROS_GRAPH = exports.DEFAULT_CONCURRENCY_LIMIT = exports.DEFAULT_GRAPHQL_RETRIES = exports.DEFAULT_GRAPHQL_TIMEOUT = exports.DEFAULT_GRAPHQL_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = exports.DEFAULT_CUTOFF_DAYS = void 0;
var node_1 = require("@gitbeaker/node");
var graphql_request_1 = require("graphql-request");
var typescript_memoize_1 = require("typescript-memoize");
var verror_1 = require("verror");
var bottleneck_1 = require("bottleneck");
exports.DEFAULT_CUTOFF_DAYS = 90;
exports.DEFAULT_PAGE_SIZE = 100;
exports.DEFAULT_GRAPHQL_PAGE_SIZE = 40;
exports.DEFAULT_GRAPHQL_TIMEOUT = 60000;
exports.DEFAULT_GRAPHQL_RETRIES = 3;
exports.DEFAULT_CONCURRENCY_LIMIT = 5;
exports.DEFAULT_FAROS_GRAPH = 'default';
exports.DEFAULT_API_URL = 'https://gitlab.com/api/v4';
exports.DEFAULT_RUN_MODE = 'Full';
var GitLab = function () {
    var _a;
    var _instanceExtraInitializers = [];
    var _getGroups_decorators;
    return _a = /** @class */ (function () {
            function GitLab(client, // GitLab API client
            gqlClient, pageSize, graphqlPageSize, graphqlTimeout, graphqlRetries, concurrencyLimit, logger, requestedStreams) {
                this.client = (__runInitializers(this, _instanceExtraInitializers), client);
                this.gqlClient = gqlClient;
                this.pageSize = pageSize;
                this.graphqlPageSize = graphqlPageSize;
                this.graphqlTimeout = graphqlTimeout;
                this.graphqlRetries = graphqlRetries;
                this.concurrencyLimit = concurrencyLimit;
                this.logger = logger;
                this.requestedStreams = requestedStreams;
            }
            GitLab.instance = function (config, logger) {
                return __awaiter(this, void 0, void 0, function () {
                    var token, apiUrl, pageSize, graphqlPageSize, graphqlTimeout, graphqlRetries, concurrencyLimit, requestedStreams, client, gqlEndpoint, gqlClient;
                    var _b, _c, _d, _e, _f, _g, _h;
                    return __generator(this, function (_j) {
                        if (_a.gitlab)
                            return [2 /*return*/, _a.gitlab];
                        token = config.token;
                        if (!token) {
                            throw new verror_1.default('GitLab token is required');
                        }
                        apiUrl = (_b = config.api_url) !== null && _b !== void 0 ? _b : exports.DEFAULT_API_URL;
                        pageSize = (_c = config.page_size) !== null && _c !== void 0 ? _c : exports.DEFAULT_PAGE_SIZE;
                        graphqlPageSize = (_d = config.graphql_page_size) !== null && _d !== void 0 ? _d : exports.DEFAULT_GRAPHQL_PAGE_SIZE;
                        graphqlTimeout = (_e = config.graphql_timeout) !== null && _e !== void 0 ? _e : exports.DEFAULT_GRAPHQL_TIMEOUT;
                        graphqlRetries = (_f = config.graphql_retries) !== null && _f !== void 0 ? _f : exports.DEFAULT_GRAPHQL_RETRIES;
                        concurrencyLimit = (_g = config.concurrency_limit) !== null && _g !== void 0 ? _g : exports.DEFAULT_CONCURRENCY_LIMIT;
                        requestedStreams = (_h = config.requestedStreams) !== null && _h !== void 0 ? _h : new Set();
                        client = new node_1.Gitlab({
                            host: apiUrl,
                            token: token,
                        });
                        gqlEndpoint = apiUrl.replace(/\/api\/v4\/?$/, '') + '/api/graphql';
                        gqlClient = new graphql_request_1.GraphQLClient(gqlEndpoint, {
                            headers: {
                                Authorization: "Bearer ".concat(token),
                            },
                            timeout: graphqlTimeout,
                        });
                        _a.gitlab = new _a(client, gqlClient, pageSize, graphqlPageSize, graphqlTimeout, graphqlRetries, concurrencyLimit, logger, requestedStreams);
                        return [2 /*return*/, _a.gitlab];
                    });
                });
            };
            GitLab.prototype.checkConnection = function () {
                return __awaiter(this, void 0, void 0, function () {
                    var err_1;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _b.trys.push([0, 2, , 3]);
                                return [4 /*yield*/, this.client.Users.current()];
                            case 1:
                                _b.sent();
                                return [3 /*break*/, 3];
                            case 2:
                                err_1 = _b.sent();
                                throw new verror_1.default(err_1, 'Failed to connect to GitLab API. Please check your token and API URL.');
                            case 3: return [2 /*return*/];
                        }
                    });
                });
            };
            GitLab.prototype.getGroups = function () {
                return __awaiter(this, void 0, void 0, function () {
                    var groups, page, hasMore, response, err_2;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _b.trys.push([0, 4, , 5]);
                                groups = [];
                                page = 1;
                                hasMore = true;
                                _b.label = 1;
                            case 1:
                                if (!hasMore) return [3 /*break*/, 3];
                                return [4 /*yield*/, this.client.Groups.all({
                                        perPage: this.pageSize,
                                        page: page,
                                    })];
                            case 2:
                                response = _b.sent();
                                if (response.length === 0) {
                                    hasMore = false;
                                }
                                else {
                                    groups.push.apply(groups, response);
                                    page++;
                                }
                                return [3 /*break*/, 1];
                            case 3: return [2 /*return*/, groups];
                            case 4:
                                err_2 = _b.sent();
                                throw new verror_1.default(err_2, 'Failed to fetch GitLab groups');
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            };
            GitLab.prototype.getGroup = function (path) {
                return __awaiter(this, void 0, void 0, function () {
                    var err_3;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _b.trys.push([0, 2, , 3]);
                                return [4 /*yield*/, this.client.Groups.show(path)];
                            case 1: return [2 /*return*/, _b.sent()];
                            case 2:
                                err_3 = _b.sent();
                                throw new verror_1.default(err_3, "Failed to fetch GitLab group: ".concat(path));
                            case 3: return [2 /*return*/];
                        }
                    });
                });
            };
            GitLab.prototype.getProjects = function (groupPath) {
                return __awaiter(this, void 0, void 0, function () {
                    var projects, page, hasMore, response, err_4;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _b.trys.push([0, 4, , 5]);
                                projects = [];
                                page = 1;
                                hasMore = true;
                                _b.label = 1;
                            case 1:
                                if (!hasMore) return [3 /*break*/, 3];
                                return [4 /*yield*/, this.client.Groups.projects(groupPath, {
                                        perPage: this.pageSize,
                                        page: page,
                                        includeSubgroups: false,
                                    })];
                            case 2:
                                response = _b.sent();
                                if (response.length === 0) {
                                    hasMore = false;
                                }
                                else {
                                    projects.push.apply(projects, response);
                                    page++;
                                }
                                return [3 /*break*/, 1];
                            case 3: return [2 /*return*/, projects];
                            case 4:
                                err_4 = _b.sent();
                                throw new verror_1.default(err_4, "Failed to fetch projects for group: ".concat(groupPath));
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            };
            GitLab.prototype.getMergeRequests = function (projectPath, startDate, endDate) {
                return __asyncGenerator(this, arguments, function getMergeRequests_1() {
                    var limiter, page_1, hasMore, response, _i, response_1, mr, err_5;
                    var _this = this;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _b.trys.push([0, 11, , 12]);
                                limiter = new bottleneck_1.default({
                                    maxConcurrent: this.concurrencyLimit,
                                });
                                page_1 = 1;
                                hasMore = true;
                                _b.label = 1;
                            case 1:
                                if (!hasMore) return [3 /*break*/, 10];
                                return [4 /*yield*/, __await(limiter.schedule(function () {
                                        return _this.client.MergeRequests.all({
                                            projectId: projectPath,
                                            updatedAfter: startDate.toISOString(),
                                            updatedBefore: endDate.toISOString(),
                                            perPage: _this.pageSize,
                                            page: page_1,
                                            scope: 'all',
                                        });
                                    }))];
                            case 2:
                                response = _b.sent();
                                if (!(response.length === 0)) return [3 /*break*/, 3];
                                hasMore = false;
                                return [3 /*break*/, 9];
                            case 3:
                                _i = 0, response_1 = response;
                                _b.label = 4;
                            case 4:
                                if (!(_i < response_1.length)) return [3 /*break*/, 8];
                                mr = response_1[_i];
                                return [4 /*yield*/, __await(mr)];
                            case 5: return [4 /*yield*/, _b.sent()];
                            case 6:
                                _b.sent();
                                _b.label = 7;
                            case 7:
                                _i++;
                                return [3 /*break*/, 4];
                            case 8:
                                page_1++;
                                _b.label = 9;
                            case 9: return [3 /*break*/, 1];
                            case 10: return [3 /*break*/, 12];
                            case 11:
                                err_5 = _b.sent();
                                throw new verror_1.default(err_5, "Failed to fetch merge requests for project: ".concat(projectPath));
                            case 12: return [2 /*return*/];
                        }
                    });
                });
            };
            GitLab.prototype.getIssues = function (projectPath, startDate, endDate) {
                return __asyncGenerator(this, arguments, function getIssues_1() {
                    var limiter, page_2, hasMore, response, _i, response_2, issue, err_6;
                    var _this = this;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _b.trys.push([0, 11, , 12]);
                                limiter = new bottleneck_1.default({
                                    maxConcurrent: this.concurrencyLimit,
                                });
                                page_2 = 1;
                                hasMore = true;
                                _b.label = 1;
                            case 1:
                                if (!hasMore) return [3 /*break*/, 10];
                                return [4 /*yield*/, __await(limiter.schedule(function () {
                                        return _this.client.Issues.all({
                                            projectId: projectPath,
                                            updatedAfter: startDate.toISOString(),
                                            updatedBefore: endDate.toISOString(),
                                            perPage: _this.pageSize,
                                            page: page_2,
                                            scope: 'all',
                                        });
                                    }))];
                            case 2:
                                response = _b.sent();
                                if (!(response.length === 0)) return [3 /*break*/, 3];
                                hasMore = false;
                                return [3 /*break*/, 9];
                            case 3:
                                _i = 0, response_2 = response;
                                _b.label = 4;
                            case 4:
                                if (!(_i < response_2.length)) return [3 /*break*/, 8];
                                issue = response_2[_i];
                                return [4 /*yield*/, __await(issue)];
                            case 5: return [4 /*yield*/, _b.sent()];
                            case 6:
                                _b.sent();
                                _b.label = 7;
                            case 7:
                                _i++;
                                return [3 /*break*/, 4];
                            case 8:
                                page_2++;
                                _b.label = 9;
                            case 9: return [3 /*break*/, 1];
                            case 10: return [3 /*break*/, 12];
                            case 11:
                                err_6 = _b.sent();
                                throw new verror_1.default(err_6, "Failed to fetch issues for project: ".concat(projectPath));
                            case 12: return [2 /*return*/];
                        }
                    });
                });
            };
            GitLab.prototype.getCommits = function (projectPath, branch, startDate, endDate) {
                return __asyncGenerator(this, arguments, function getCommits_1() {
                    var limiter, page_3, hasMore, response, _i, response_3, commit, err_7;
                    var _this = this;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _b.trys.push([0, 11, , 12]);
                                limiter = new bottleneck_1.default({
                                    maxConcurrent: this.concurrencyLimit,
                                });
                                page_3 = 1;
                                hasMore = true;
                                _b.label = 1;
                            case 1:
                                if (!hasMore) return [3 /*break*/, 10];
                                return [4 /*yield*/, __await(limiter.schedule(function () {
                                        return _this.client.Commits.all(projectPath, {
                                            ref_name: branch,
                                            since: startDate.toISOString(),
                                            until: endDate.toISOString(),
                                            perPage: _this.pageSize,
                                            page: page_3,
                                        });
                                    }))];
                            case 2:
                                response = _b.sent();
                                if (!(response.length === 0)) return [3 /*break*/, 3];
                                hasMore = false;
                                return [3 /*break*/, 9];
                            case 3:
                                _i = 0, response_3 = response;
                                _b.label = 4;
                            case 4:
                                if (!(_i < response_3.length)) return [3 /*break*/, 8];
                                commit = response_3[_i];
                                return [4 /*yield*/, __await(commit)];
                            case 5: return [4 /*yield*/, _b.sent()];
                            case 6:
                                _b.sent();
                                _b.label = 7;
                            case 7:
                                _i++;
                                return [3 /*break*/, 4];
                            case 8:
                                page_3++;
                                _b.label = 9;
                            case 9: return [3 /*break*/, 1];
                            case 10: return [3 /*break*/, 12];
                            case 11:
                                err_7 = _b.sent();
                                throw new verror_1.default(err_7, "Failed to fetch commits for project: ".concat(projectPath, ", branch: ").concat(branch));
                            case 12: return [2 /*return*/];
                        }
                    });
                });
            };
            GitLab.prototype.getTags = function (projectPath) {
                return __asyncGenerator(this, arguments, function getTags_1() {
                    var limiter, page_4, hasMore, response, _i, response_4, tag, err_8;
                    var _this = this;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _b.trys.push([0, 11, , 12]);
                                limiter = new bottleneck_1.default({
                                    maxConcurrent: this.concurrencyLimit,
                                });
                                page_4 = 1;
                                hasMore = true;
                                _b.label = 1;
                            case 1:
                                if (!hasMore) return [3 /*break*/, 10];
                                return [4 /*yield*/, __await(limiter.schedule(function () {
                                        return _this.client.Tags.all(projectPath, {
                                            perPage: _this.pageSize,
                                            page: page_4,
                                        });
                                    }))];
                            case 2:
                                response = _b.sent();
                                if (!(response.length === 0)) return [3 /*break*/, 3];
                                hasMore = false;
                                return [3 /*break*/, 9];
                            case 3:
                                _i = 0, response_4 = response;
                                _b.label = 4;
                            case 4:
                                if (!(_i < response_4.length)) return [3 /*break*/, 8];
                                tag = response_4[_i];
                                return [4 /*yield*/, __await(tag)];
                            case 5: return [4 /*yield*/, _b.sent()];
                            case 6:
                                _b.sent();
                                _b.label = 7;
                            case 7:
                                _i++;
                                return [3 /*break*/, 4];
                            case 8:
                                page_4++;
                                _b.label = 9;
                            case 9: return [3 /*break*/, 1];
                            case 10: return [3 /*break*/, 12];
                            case 11:
                                err_8 = _b.sent();
                                throw new verror_1.default(err_8, "Failed to fetch tags for project: ".concat(projectPath));
                            case 12: return [2 /*return*/];
                        }
                    });
                });
            };
            GitLab.prototype.getReleases = function (projectPath) {
                return __asyncGenerator(this, arguments, function getReleases_1() {
                    var limiter, page_5, hasMore, response, _i, response_5, release, err_9;
                    var _this = this;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _b.trys.push([0, 11, , 12]);
                                limiter = new bottleneck_1.default({
                                    maxConcurrent: this.concurrencyLimit,
                                });
                                page_5 = 1;
                                hasMore = true;
                                _b.label = 1;
                            case 1:
                                if (!hasMore) return [3 /*break*/, 10];
                                return [4 /*yield*/, __await(limiter.schedule(function () {
                                        return _this.client.Releases.all(projectPath, {
                                            perPage: _this.pageSize,
                                            page: page_5,
                                        });
                                    }))];
                            case 2:
                                response = _b.sent();
                                if (!(response.length === 0)) return [3 /*break*/, 3];
                                hasMore = false;
                                return [3 /*break*/, 9];
                            case 3:
                                _i = 0, response_5 = response;
                                _b.label = 4;
                            case 4:
                                if (!(_i < response_5.length)) return [3 /*break*/, 8];
                                release = response_5[_i];
                                return [4 /*yield*/, __await(release)];
                            case 5: return [4 /*yield*/, _b.sent()];
                            case 6:
                                _b.sent();
                                _b.label = 7;
                            case 7:
                                _i++;
                                return [3 /*break*/, 4];
                            case 8:
                                page_5++;
                                _b.label = 9;
                            case 9: return [3 /*break*/, 1];
                            case 10: return [3 /*break*/, 12];
                            case 11:
                                err_9 = _b.sent();
                                throw new verror_1.default(err_9, "Failed to fetch releases for project: ".concat(projectPath));
                            case 12: return [2 /*return*/];
                        }
                    });
                });
            };
            GitLab.prototype.getUsers = function (groupPath) {
                return __asyncGenerator(this, arguments, function getUsers_1() {
                    var limiter, page_6, hasMore, response, _i, response_6, user, err_10;
                    var _this = this;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _b.trys.push([0, 11, , 12]);
                                limiter = new bottleneck_1.default({
                                    maxConcurrent: this.concurrencyLimit,
                                });
                                page_6 = 1;
                                hasMore = true;
                                _b.label = 1;
                            case 1:
                                if (!hasMore) return [3 /*break*/, 10];
                                return [4 /*yield*/, __await(limiter.schedule(function () {
                                        return _this.client.GroupMembers.all(groupPath, {
                                            perPage: _this.pageSize,
                                            page: page_6,
                                        });
                                    }))];
                            case 2:
                                response = _b.sent();
                                if (!(response.length === 0)) return [3 /*break*/, 3];
                                hasMore = false;
                                return [3 /*break*/, 9];
                            case 3:
                                _i = 0, response_6 = response;
                                _b.label = 4;
                            case 4:
                                if (!(_i < response_6.length)) return [3 /*break*/, 8];
                                user = response_6[_i];
                                return [4 /*yield*/, __await(user)];
                            case 5: return [4 /*yield*/, _b.sent()];
                            case 6:
                                _b.sent();
                                _b.label = 7;
                            case 7:
                                _i++;
                                return [3 /*break*/, 4];
                            case 8:
                                page_6++;
                                _b.label = 9;
                            case 9: return [3 /*break*/, 1];
                            case 10: return [3 /*break*/, 12];
                            case 11:
                                err_10 = _b.sent();
                                throw new verror_1.default(err_10, "Failed to fetch users for group: ".concat(groupPath));
                            case 12: return [2 /*return*/];
                        }
                    });
                });
            };
            return GitLab;
        }()),
        (function () {
            var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _getGroups_decorators = [(0, typescript_memoize_1.Memoize)()];
            __esDecorate(_a, null, _getGroups_decorators, { kind: "method", name: "getGroups", static: false, private: false, access: { has: function (obj) { return "getGroups" in obj; }, get: function (obj) { return obj.getGroups; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a.gitlab = null,
        _a;
}();
exports.GitLab = GitLab;

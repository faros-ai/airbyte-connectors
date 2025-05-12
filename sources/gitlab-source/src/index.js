"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitLabSource = void 0;
exports.mainCommand = mainCommand;
var faros_airbyte_cdk_1 = require("faros-airbyte-cdk");
var common_1 = require("faros-airbyte-common/common");
var faros_js_client_1 = require("faros-js-client");
var verror_1 = require("verror");
var gitlab_1 = require("./gitlab");
var common_2 = require("./streams/common");
var commits_1 = require("./streams/commits");
var groups_1 = require("./streams/groups");
var issues_1 = require("./streams/issues");
var merge_requests_1 = require("./streams/merge_requests");
var projects_1 = require("./streams/projects");
var releases_1 = require("./streams/releases");
var tags_1 = require("./streams/tags");
var users_1 = require("./streams/users");
var workspace_repo_filter_1 = require("./workspace-repo-filter");
function mainCommand() {
    var logger = new faros_airbyte_cdk_1.AirbyteSourceLogger();
    var source = new GitLabSource(logger);
    return new faros_airbyte_cdk_1.AirbyteSourceRunner(logger, source).mainCommand();
}
var GitLabSource = /** @class */ (function (_super) {
    __extends(GitLabSource, _super);
    function GitLabSource() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Object.defineProperty(GitLabSource.prototype, "type", {
        get: function () {
            return 'gitlab';
        },
        enumerable: false,
        configurable: true
    });
    GitLabSource.prototype.spec = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new faros_airbyte_cdk_1.AirbyteSpec(require('../resources/spec.json'))];
            });
        });
    };
    GitLabSource.prototype.checkConnection = function (config) {
        return __awaiter(this, void 0, void 0, function () {
            var gitlab, err_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, gitlab_1.GitLab.instance(config, this.logger)];
                    case 1:
                        gitlab = _a.sent();
                        return [4 /*yield*/, gitlab.checkConnection()];
                    case 2:
                        _a.sent();
                        if (config.use_faros_graph_repos_selection && !config.api_key) {
                            return [2 /*return*/, [
                                    false,
                                    new verror_1.default('Faros credentials are required when using Faros Graph for repositories selection'),
                                ]];
                        }
                        return [4 /*yield*/, workspace_repo_filter_1.WorkspaceRepoFilter.instance(config, this.logger, this.makeFarosClient(config)).getGroups()];
                    case 3:
                        _a.sent();
                        return [2 /*return*/, [true, undefined]];
                    case 4:
                        err_1 = _a.sent();
                        return [2 /*return*/, [false, err_1]];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    GitLabSource.prototype.makeFarosClient = function (config) {
        var _a;
        if (!config.api_key) {
            return undefined;
        }
        return new faros_js_client_1.FarosClient({
            url: (_a = config.api_url) !== null && _a !== void 0 ? _a : 'https://prod.api.faros.ai',
            apiKey: config.api_key,
        });
    };
    GitLabSource.prototype.streams = function (config) {
        var farosClient = this.makeFarosClient(config);
        var emitActivities = config.run_mode !== common_2.RunMode.Minimum;
        return [
            new groups_1.Groups(config, this.logger, farosClient),
            new projects_1.Projects(config, this.logger, farosClient),
            new merge_requests_1.MergeRequests(config, this.logger, farosClient, emitActivities),
            new issues_1.Issues(config, this.logger, farosClient),
            new commits_1.Commits(config, this.logger, farosClient),
            new tags_1.Tags(config, this.logger, farosClient),
            new releases_1.Releases(config, this.logger, farosClient),
            new users_1.Users(config, this.logger, farosClient),
        ];
    };
    GitLabSource.prototype.onBeforeRead = function (config, catalog, state) {
        return __awaiter(this, void 0, void 0, function () {
            var streamNames, streams, _a, startDate, endDate, _b, newConfig, newState;
            var _c, _d;
            return __generator(this, function (_e) {
                streamNames = __spreadArray([], common_2.RunModeStreams[(_c = config.run_mode) !== null && _c !== void 0 ? _c : gitlab_1.DEFAULT_RUN_MODE], true).filter(function (streamName) {
                    var _a;
                    return config.run_mode !== common_2.RunMode.Custom ||
                        !((_a = config.custom_streams) === null || _a === void 0 ? void 0 : _a.length) ||
                        config.custom_streams.includes(streamName);
                });
                streams = catalog.streams.filter(function (stream) {
                    return streamNames.includes(stream.stream.name);
                });
                _a = (0, common_1.calculateDateRange)({
                    start_date: config.start_date,
                    end_date: config.end_date,
                    cutoff_days: (_d = config.cutoff_days) !== null && _d !== void 0 ? _d : gitlab_1.DEFAULT_CUTOFF_DAYS,
                    logger: this.logger.info.bind(this.logger),
                }), startDate = _a.startDate, endDate = _a.endDate;
                _b = (0, common_1.applyRoundRobinBucketing)(config, state, this.logger.info.bind(this.logger)), newConfig = _b.config, newState = _b.state;
                return [2 /*return*/, {
                        config: __assign(__assign({}, newConfig), { startDate: startDate, endDate: endDate, requestedStreams: new Set(streamNames) }),
                        catalog: { streams: streams },
                        state: newState,
                    }];
            });
        });
    };
    return GitLabSource;
}(faros_airbyte_cdk_1.AirbyteSourceBase));
exports.GitLabSource = GitLabSource;

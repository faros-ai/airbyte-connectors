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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractGitLabStream = exports.StreamWithProjectSlices = exports.RunModeStreams = exports.RunMode = void 0;
/** Run mode determines which streams to sync */
var RunMode;
(function (RunMode) {
    /** Sync minimal set of streams */
    RunMode["Minimum"] = "Minimum";
    /** Sync all streams */
    RunMode["Full"] = "Full";
    /** Sync only specified streams */
    RunMode["Custom"] = "Custom";
})(RunMode || (exports.RunMode = RunMode = {}));
/** Stream names for each run mode */
exports.RunModeStreams = (_a = {},
    _a[RunMode.Minimum] = [
        'gitlab_groups',
        'gitlab_projects',
        'gitlab_users',
        'gitlab_merge_requests',
    ],
    _a[RunMode.Full] = [
        'gitlab_groups',
        'gitlab_projects',
        'gitlab_users',
        'gitlab_merge_requests',
        'gitlab_issues',
        'gitlab_commits',
        'gitlab_tags',
        'gitlab_releases',
    ],
    _a[RunMode.Custom] = [],
    _a);
/** Base class for streams that iterate over projects */
var StreamWithProjectSlices = /** @class */ (function (_super) {
    __extends(StreamWithProjectSlices, _super);
    function StreamWithProjectSlices(config, logger, farosClient) {
        var _this = _super.call(this, config, logger, farosClient) || this;
        _this.config = config;
        _this.logger = logger;
        _this.farosClient = farosClient;
        return _this;
    }
    /**
     * Get stream slices for this stream
     * Each slice represents a project to process
     */
    StreamWithProjectSlices.prototype.streamSlices = function () {
        return __asyncGenerator(this, arguments, function streamSlices_1() {
            var filter, groups, _i, groups_1, group, projects, _a, projects_1, _b, project, syncProjectData;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, __await(this.getWorkspaceRepoFilter())];
                    case 1:
                        filter = _c.sent();
                        return [4 /*yield*/, __await(filter.getGroups())];
                    case 2:
                        groups = _c.sent();
                        _i = 0, groups_1 = groups;
                        _c.label = 3;
                    case 3:
                        if (!(_i < groups_1.length)) return [3 /*break*/, 10];
                        group = groups_1[_i];
                        return [4 /*yield*/, __await(filter.getProjects(group))];
                    case 4:
                        projects = _c.sent();
                        _a = 0, projects_1 = projects;
                        _c.label = 5;
                    case 5:
                        if (!(_a < projects_1.length)) return [3 /*break*/, 9];
                        _b = projects_1[_a], project = _b.project, syncProjectData = _b.syncProjectData;
                        if (!syncProjectData) return [3 /*break*/, 8];
                        return [4 /*yield*/, __await({ group: group, project: project.name })];
                    case 6: return [4 /*yield*/, _c.sent()];
                    case 7:
                        _c.sent();
                        _c.label = 8;
                    case 8:
                        _a++;
                        return [3 /*break*/, 5];
                    case 9:
                        _i++;
                        return [3 /*break*/, 3];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get cutoff date from stream state for a specific project
     */
    StreamWithProjectSlices.prototype.getCutoffFromState = function (streamState, group, project) {
        var _a, _b;
        if (!streamState)
            return null;
        var projectKey = "".concat(group, "/").concat(project);
        return (_b = (_a = streamState[projectKey]) === null || _a === void 0 ? void 0 : _a.cutoff) !== null && _b !== void 0 ? _b : null;
    };
    /**
     * Get date range for updates based on cutoff
     */
    StreamWithProjectSlices.prototype.getUpdateRange = function (cutoff) {
        var _a, _b;
        var endDate = (_a = this.config.endDate) !== null && _a !== void 0 ? _a : new Date();
        var startDate;
        if (cutoff) {
            startDate = new Date(cutoff);
        }
        else {
            startDate = (_b = this.config.startDate) !== null && _b !== void 0 ? _b : new Date();
        }
        return [startDate, endDate];
    };
    return StreamWithProjectSlices;
}(AbstractGitLabStream));
exports.StreamWithProjectSlices = StreamWithProjectSlices;
/** Base class for all GitLab streams */
var AbstractGitLabStream = /** @class */ (function () {
    function AbstractGitLabStream(config, logger, farosClient) {
        this.config = config;
        this.logger = logger;
        this.farosClient = farosClient;
    }
    /**
     * Get workspace-repo filter instance
     */
    AbstractGitLabStream.prototype.getWorkspaceRepoFilter = function () {
        return __awaiter(this, void 0, void 0, function () {
            var WorkspaceRepoFilter;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../workspace-repo-filter'); })];
                    case 1:
                        WorkspaceRepoFilter = (_a.sent()).WorkspaceRepoFilter;
                        return [2 /*return*/, WorkspaceRepoFilter.instance(this.config, this.logger, this.farosClient)];
                }
            });
        });
    };
    return AbstractGitLabStream;
}());
exports.AbstractGitLabStream = AbstractGitLabStream;

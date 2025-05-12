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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
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
exports.Commits = void 0;
var gitlab_1 = require("../gitlab");
var common_1 = require("./common");
var Commits = /** @class */ (function (_super) {
    __extends(Commits, _super);
    function Commits(config, logger, farosClient) {
        var _this = _super.call(this, config, logger, farosClient) || this;
        _this.config = config;
        _this.logger = logger;
        _this.farosClient = farosClient;
        return _this;
    }
    Commits.prototype.getJsonSchema = function () {
        return require('../../resources/schemas/commits.json');
    };
    Object.defineProperty(Commits.prototype, "primaryKey", {
        get: function () {
            return 'id';
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Commits.prototype, "cursorField", {
        get: function () {
            return ['committed_date'];
        },
        enumerable: false,
        configurable: true
    });
    Commits.prototype.readRecords = function (syncMode, cursorField, streamSlice, streamState) {
        return __asyncGenerator(this, arguments, function readRecords_1() {
            var group, project, gitlab, cutoff, _a, startDate, endDate, projectPath, projectDetails, projectsArray, projectInfo, defaultBranch, commits, latestCutoff, _b, commits_1, commits_1_1, commit, committedDate, e_1_1, projectKey, error_1;
            var _c, e_1, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        if (!!streamSlice) return [3 /*break*/, 2];
                        return [4 /*yield*/, __await(void 0)];
                    case 1: return [2 /*return*/, _f.sent()];
                    case 2:
                        group = streamSlice.group, project = streamSlice.project;
                        return [4 /*yield*/, __await(gitlab_1.GitLab.instance(this.config, this.logger))];
                    case 3:
                        gitlab = _f.sent();
                        cutoff = this.getCutoffFromState(streamState, group, project);
                        _a = this.getUpdateRange(cutoff), startDate = _a[0], endDate = _a[1];
                        _f.label = 4;
                    case 4:
                        _f.trys.push([4, 20, , 21]);
                        projectPath = "".concat(group, "/").concat(project);
                        return [4 /*yield*/, __await(gitlab.getProjects(group))];
                    case 5:
                        projectDetails = _f.sent();
                        projectsArray = __spreadArray([], projectDetails, true);
                        projectInfo = projectsArray.find(function (p) { return p.path === project; });
                        defaultBranch = (projectInfo === null || projectInfo === void 0 ? void 0 : projectInfo.default_branch) || 'main';
                        commits = gitlab.getCommits(projectPath, defaultBranch, startDate, endDate);
                        latestCutoff = cutoff ? new Date(cutoff) : null;
                        _f.label = 6;
                    case 6:
                        _f.trys.push([6, 13, 14, 19]);
                        _b = true, commits_1 = __asyncValues(commits);
                        _f.label = 7;
                    case 7: return [4 /*yield*/, __await(commits_1.next())];
                    case 8:
                        if (!(commits_1_1 = _f.sent(), _c = commits_1_1.done, !_c)) return [3 /*break*/, 12];
                        _e = commits_1_1.value;
                        _b = false;
                        commit = _e;
                        committedDate = new Date(commit.committed_date);
                        if (!latestCutoff || committedDate > latestCutoff) {
                            latestCutoff = committedDate;
                        }
                        return [4 /*yield*/, __await(__assign(__assign({}, commit), { project_path: projectPath, branch: defaultBranch }))];
                    case 9: return [4 /*yield*/, _f.sent()];
                    case 10:
                        _f.sent();
                        _f.label = 11;
                    case 11:
                        _b = true;
                        return [3 /*break*/, 7];
                    case 12: return [3 /*break*/, 19];
                    case 13:
                        e_1_1 = _f.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 19];
                    case 14:
                        _f.trys.push([14, , 17, 18]);
                        if (!(!_b && !_c && (_d = commits_1.return))) return [3 /*break*/, 16];
                        return [4 /*yield*/, __await(_d.call(commits_1))];
                    case 15:
                        _f.sent();
                        _f.label = 16;
                    case 16: return [3 /*break*/, 18];
                    case 17:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 18: return [7 /*endfinally*/];
                    case 19:
                        if (latestCutoff) {
                            projectKey = "".concat(group, "/").concat(project);
                            this.logger.info("Synced commits for ".concat(projectKey, " up to ").concat(latestCutoff.toISOString()));
                        }
                        return [3 /*break*/, 21];
                    case 20:
                        error_1 = _f.sent();
                        this.logger.error("Error fetching commits for ".concat(group, "/").concat(project, ": ").concat(error_1.message));
                        return [3 /*break*/, 21];
                    case 21: return [2 /*return*/];
                }
            });
        });
    };
    return Commits;
}(common_1.StreamWithProjectSlices));
exports.Commits = Commits;

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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceRepoFilter = void 0;
var common_1 = require("faros-airbyte-common/common");
var lodash_1 = require("lodash");
var typescript_memoize_1 = require("typescript-memoize");
var verror_1 = require("verror");
var gitlab_1 = require("./gitlab");
var WorkspaceRepoFilter = function () {
    var _a;
    var _instanceExtraInitializers = [];
    var _getGroups_decorators;
    var _getProjects_decorators;
    return _a = /** @class */ (function () {
            function WorkspaceRepoFilter(config, logger, farosClient) {
                var _b;
                var _c;
                this.config = (__runInitializers(this, _instanceExtraInitializers), config);
                this.logger = logger;
                this.farosClient = farosClient;
                this.projectsByGroup = new Map();
                this.loadedSelectedProjects = false;
                this.useFarosGraphReposSelection = (_c = config.use_faros_graph_repos_selection) !== null && _c !== void 0 ? _c : false;
                var _d = this.config, groups = _d.groups, projects = _d.projects, excluded_projects = _d.excluded_projects;
                var excluded_groups = this.config.excluded_groups;
                if ((groups === null || groups === void 0 ? void 0 : groups.length) && (excluded_groups === null || excluded_groups === void 0 ? void 0 : excluded_groups.length)) {
                    this.logger.warn('Both groups and excluded_groups are specified, excluded_groups will be ignored.');
                    excluded_groups = undefined;
                }
                var projectsByGroup;
                var excludedProjectsByGroup;
                if (!this.useFarosGraphReposSelection) {
                    (_b = this.getSelectedProjectsByGroup(projects, excluded_projects), projectsByGroup = _b.projectsByGroup, excludedProjectsByGroup = _b.excludedProjectsByGroup);
                    this.loadedSelectedProjects = true;
                }
                else {
                    if (!this.hasFarosClient()) {
                        throw new verror_1.default('Faros credentials are required when using Faros Graph for repositories selection');
                    }
                    if ((projects === null || projects === void 0 ? void 0 : projects.length) || (excluded_projects === null || excluded_projects === void 0 ? void 0 : excluded_projects.length)) {
                        logger.warn('Using Faros Graph for repositories selection but projects and/or excluded_projects are specified, both will be ignored.');
                    }
                }
                this.filterConfig = {
                    groups: (groups === null || groups === void 0 ? void 0 : groups.length) ? new Set(groups.map(lodash_1.toLower)) : undefined,
                    excludedGroups: (excluded_groups === null || excluded_groups === void 0 ? void 0 : excluded_groups.length)
                        ? new Set(excluded_groups.map(lodash_1.toLower))
                        : undefined,
                    projectsByGroup: projectsByGroup,
                    excludedProjectsByGroup: excludedProjectsByGroup,
                };
            }
            WorkspaceRepoFilter.instance = function (config, logger, farosClient) {
                if (!this._instance) {
                    this._instance = new _a(config, logger, farosClient);
                }
                return this._instance;
            };
            WorkspaceRepoFilter.prototype.getGroups = function () {
                return __awaiter(this, void 0, void 0, function () {
                    var gitlab, visibleGroups, _b, _c;
                    return __generator(this, function (_d) {
                        switch (_d.label) {
                            case 0:
                                if (!!this.groups) return [3 /*break*/, 4];
                                return [4 /*yield*/, gitlab_1.GitLab.instance(this.config, this.logger)];
                            case 1:
                                gitlab = _d.sent();
                                _b = Set.bind;
                                return [4 /*yield*/, gitlab.getGroups()];
                            case 2:
                                visibleGroups = new (_b.apply(Set, [void 0, (_d.sent()).map(function (g) { return (0, lodash_1.toLower)(g.path); })]))();
                                if (!visibleGroups.size) {
                                    this.logger.warn('No visible groups found');
                                }
                                _c = this;
                                return [4 /*yield*/, this.filterGroups(visibleGroups, gitlab)];
                            case 3:
                                _c.groups = _d.sent();
                                _d.label = 4;
                            case 4:
                                if (this.groups.size === 0) {
                                    throw new verror_1.default('No visible groups remain after applying inclusion and exclusion filters');
                                }
                                return [2 /*return*/, Array.from(this.groups)];
                        }
                    });
                });
            };
            WorkspaceRepoFilter.prototype.filterGroups = function (visibleGroups, gitlab) {
                return __awaiter(this, void 0, void 0, function () {
                    var groups, _i, visibleGroups_1, group, lowerGroup, _b, _c, group, lowerGroup;
                    var _d;
                    return __generator(this, function (_e) {
                        switch (_e.label) {
                            case 0:
                                groups = new Set();
                                if (!!this.filterConfig.groups) return [3 /*break*/, 1];
                                for (_i = 0, visibleGroups_1 = visibleGroups; _i < visibleGroups_1.length; _i++) {
                                    group = visibleGroups_1[_i];
                                    lowerGroup = (0, lodash_1.toLower)(group);
                                    if (!((_d = this.filterConfig.excludedGroups) === null || _d === void 0 ? void 0 : _d.has(lowerGroup))) {
                                        groups.add(lowerGroup);
                                    }
                                    else {
                                        this.logger.info("Skipping excluded group ".concat(lowerGroup));
                                    }
                                }
                                return [3 /*break*/, 5];
                            case 1:
                                _b = 0, _c = this.filterConfig.groups;
                                _e.label = 2;
                            case 2:
                                if (!(_b < _c.length)) return [3 /*break*/, 5];
                                group = _c[_b];
                                lowerGroup = (0, lodash_1.toLower)(group);
                                return [4 /*yield*/, this.isVisibleGroup(visibleGroups, lowerGroup, gitlab)];
                            case 3:
                                if (_e.sent()) {
                                    groups.add(lowerGroup);
                                }
                                _e.label = 4;
                            case 4:
                                _b++;
                                return [3 /*break*/, 2];
                            case 5: return [2 /*return*/, groups];
                        }
                    });
                });
            };
            WorkspaceRepoFilter.prototype.isVisibleGroup = function (visibleGroups, lowerGroup, gitlab) {
                return __awaiter(this, void 0, void 0, function () {
                    var error_1;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                if (visibleGroups.has(lowerGroup)) {
                                    return [2 /*return*/, true];
                                }
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, gitlab.getGroup(lowerGroup)];
                            case 2:
                                _b.sent();
                                return [2 /*return*/, true];
                            case 3:
                                error_1 = _b.sent();
                                this.logger.warn("Fetching group ".concat(lowerGroup, " failed with error: ") +
                                    "".concat(error_1.status, " - ").concat(error_1.message, ". Skipping."));
                                return [2 /*return*/, false];
                            case 4: return [2 /*return*/];
                        }
                    });
                });
            };
            WorkspaceRepoFilter.prototype.getProjects = function (group) {
                return __awaiter(this, void 0, void 0, function () {
                    var lowerGroup, projects, gitlab, visibleProjects, _i, visibleProjects_1, project, lowerProjectName, _b, included, syncProjectData;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                lowerGroup = (0, lodash_1.toLower)(group);
                                return [4 /*yield*/, this.loadSelectedProjects()];
                            case 1:
                                _c.sent();
                                if (!!this.projectsByGroup.has(lowerGroup)) return [3 /*break*/, 8];
                                projects = new Map();
                                return [4 /*yield*/, gitlab_1.GitLab.instance(this.config, this.logger)];
                            case 2:
                                gitlab = _c.sent();
                                return [4 /*yield*/, gitlab.getProjects(lowerGroup)];
                            case 3:
                                visibleProjects = _c.sent();
                                if (!visibleProjects.length) {
                                    this.logger.warn("No visible projects found for group ".concat(lowerGroup));
                                }
                                _i = 0, visibleProjects_1 = visibleProjects;
                                _c.label = 4;
                            case 4:
                                if (!(_i < visibleProjects_1.length)) return [3 /*break*/, 7];
                                project = visibleProjects_1[_i];
                                lowerProjectName = (0, lodash_1.toLower)(project.path);
                                return [4 /*yield*/, this.getProjectInclusion(lowerGroup, lowerProjectName)];
                            case 5:
                                _b = _c.sent(), included = _b.included, syncProjectData = _b.syncProjectData;
                                if (included) {
                                    projects.set(lowerProjectName, { project: project, syncProjectData: syncProjectData });
                                }
                                _c.label = 6;
                            case 6:
                                _i++;
                                return [3 /*break*/, 4];
                            case 7:
                                this.projectsByGroup.set(lowerGroup, projects);
                                _c.label = 8;
                            case 8: return [2 /*return*/, Array.from(this.projectsByGroup.get(lowerGroup).values())];
                        }
                    });
                });
            };
            WorkspaceRepoFilter.prototype.getProjectInclusion = function (group, project) {
                return __awaiter(this, void 0, void 0, function () {
                    var _b, projectsByGroup, excludedProjectsByGroup, projects, excludedProjects, included, syncProjectData, included, included;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0: return [4 /*yield*/, this.loadSelectedProjects()];
                            case 1:
                                _c.sent();
                                _b = this.filterConfig, projectsByGroup = _b.projectsByGroup, excludedProjectsByGroup = _b.excludedProjectsByGroup;
                                projects = projectsByGroup.get(group);
                                excludedProjects = excludedProjectsByGroup.get(group);
                                if (this.useFarosGraphReposSelection) {
                                    included = true;
                                    syncProjectData = (!(projects === null || projects === void 0 ? void 0 : projects.size) || projects.has(project)) && !(excludedProjects === null || excludedProjects === void 0 ? void 0 : excludedProjects.has(project));
                                    return [2 /*return*/, { included: included, syncProjectData: syncProjectData }];
                                }
                                if (projects === null || projects === void 0 ? void 0 : projects.size) {
                                    included = projects.has(project);
                                    return [2 /*return*/, { included: included, syncProjectData: included }];
                                }
                                if (excludedProjects === null || excludedProjects === void 0 ? void 0 : excludedProjects.size) {
                                    included = !excludedProjects.has(project);
                                    return [2 /*return*/, { included: included, syncProjectData: included }];
                                }
                                return [2 /*return*/, { included: true, syncProjectData: true }];
                        }
                    });
                });
            };
            WorkspaceRepoFilter.prototype.loadSelectedProjects = function () {
                return __awaiter(this, void 0, void 0, function () {
                    var farosOptions, projects, excludedProjects, _b, projectsByGroup, excludedProjectsByGroup;
                    var _c;
                    return __generator(this, function (_d) {
                        switch (_d.label) {
                            case 0:
                                if (this.loadedSelectedProjects) {
                                    return [2 /*return*/];
                                }
                                if (!this.useFarosGraphReposSelection) return [3 /*break*/, 2];
                                return [4 /*yield*/, (0, common_1.getFarosOptions)('repository', 'GitLab', this.farosClient, (_c = this.config.graph) !== null && _c !== void 0 ? _c : gitlab_1.DEFAULT_FAROS_GRAPH)];
                            case 1:
                                farosOptions = _d.sent();
                                projects = farosOptions.included, excludedProjects = farosOptions.excluded;
                                _b = this.getSelectedProjectsByGroup(Array.from(projects), Array.from(excludedProjects)), projectsByGroup = _b.projectsByGroup, excludedProjectsByGroup = _b.excludedProjectsByGroup;
                                this.filterConfig.projectsByGroup = projectsByGroup;
                                this.filterConfig.excludedProjectsByGroup = excludedProjectsByGroup;
                                _d.label = 2;
                            case 2:
                                this.loadedSelectedProjects = true;
                                return [2 /*return*/];
                        }
                    });
                });
            };
            WorkspaceRepoFilter.prototype.getSelectedProjectsByGroup = function (projects, excludedProjects) {
                var projectsByGroup = new Map();
                var excludedProjectsByGroup = new Map();
                if (projects === null || projects === void 0 ? void 0 : projects.length) {
                    (0, common_1.collectReposByOrg)(projectsByGroup, projects);
                }
                if (excludedProjects === null || excludedProjects === void 0 ? void 0 : excludedProjects.length) {
                    (0, common_1.collectReposByOrg)(excludedProjectsByGroup, excludedProjects);
                }
                for (var _i = 0, _b = projectsByGroup.keys(); _i < _b.length; _i++) {
                    var group = _b[_i];
                    if (excludedProjectsByGroup.has(group)) {
                        this.logger.warn("Both projects and excluded_projects are specified for group ".concat(group, ", excluded_projects for group ").concat(group, " will be ignored."));
                        excludedProjectsByGroup.delete(group);
                    }
                }
                return { projectsByGroup: projectsByGroup, excludedProjectsByGroup: excludedProjectsByGroup };
            };
            WorkspaceRepoFilter.prototype.hasFarosClient = function () {
                return Boolean(this.farosClient);
            };
            return WorkspaceRepoFilter;
        }()),
        (function () {
            var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _getGroups_decorators = [(0, typescript_memoize_1.Memoize)()];
            _getProjects_decorators = [(0, typescript_memoize_1.Memoize)()];
            __esDecorate(_a, null, _getGroups_decorators, { kind: "method", name: "getGroups", static: false, private: false, access: { has: function (obj) { return "getGroups" in obj; }, get: function (obj) { return obj.getGroups; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _getProjects_decorators, { kind: "method", name: "getProjects", static: false, private: false, access: { has: function (obj) { return "getProjects" in obj; }, get: function (obj) { return obj.getProjects; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
}();
exports.WorkspaceRepoFilter = WorkspaceRepoFilter;

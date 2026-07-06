import React, { useState, useRef, useEffect, useMemo } from "react";
import JSZip from "jszip";
import {
  Folder,
  FolderOpen,
  FileCode,
  Cpu,
  Sparkles,
  Upload,
  Download,
  Copy,
  Play,
  ArrowRight,
  Check,
  AlertCircle,
  FileJson,
  RefreshCw,
  Layers,
  Terminal,
  HelpCircle,
  Code,
  Info,
  Layers2,
  GitBranch,
  ChevronRight,
  ChevronDown,
  Settings,
  ShieldCheck,
  Search
} from "lucide-react";
import { DEMO_JS, DEMO_SOURCE_MAP } from "./demoData";

// Type definitions for Reconstructed Source Tree
interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  content?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"sourcemap" | "unpacker" | "scratchpad">("sourcemap");
  
  // States for Source Map Restorer
  const [minifiedJs, setMinifiedJs] = useState("");
  const [sourceMapJson, setSourceMapJson] = useState("");
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [sourceMapStatus, setSourceMapStatus] = useState<string>("");
  const [sourceMapError, setSourceMapError] = useState<string>("");

  // States for Webpack Unpacker
  const [packedJs, setPackedJs] = useState("");
  const [unpackedModules, setUnpackedModules] = useState<{ id: string; code: string; name: string }[]>([]);
  const [selectedModule, setSelectedModule] = useState<{ id: string; code: string; name: string } | null>(null);
  const [searchModuleQuery, setSearchModuleQuery] = useState("");

  // States for AI Deobfuscation & Scratchpad
  const [scratchpadInput, setScratchpadInput] = useState("");
  const [scratchpadOutput, setScratchpadOutput] = useState("");
  const [scratchpadContext, setScratchpadContext] = useState("");
  const [isDeobfuscating, setIsDeobfuscating] = useState(false);
  const [aiExplainText, setAiExplainText] = useState("");
  const [showAiExplain, setShowAiExplain] = useState(false);
  const [aiProgressMessage, setAiProgressMessage] = useState("");

  // UI notifications/copies
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapInputRef = useRef<HTMLInputElement>(null);
  const unpackerFileInputRef = useRef<HTMLInputElement>(null);

  // AI loading quotes for fun
  const aiQuotes = [
    "Analyzing Abstract Syntax Tree (AST)...",
    "Restoring lexical scopes & scoping blocks...",
    "Reconstructing descriptive identifiers based on contextual clues...",
    "Gemini is generating self-documenting code with inline explanations...",
    "Almost ready! Formatting with beautiful indentation..."
  ];

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Heuristic based Webpack / Vite module unpacker (brace counting algorithm)
  const handleUnpackWebpack = (code: string) => {
    if (!code) return;
    setSourceMapStatus("Unpacking bundle...");
    
    const modules: { id: string; code: string; name: string }[] = [];
    // Webpack standard module definition pattern: ID: function(e,t,n){ or "ID": function(...) {
    const regex = /\b(\d+|"[^"]+"|'[^']+'):\s*function\s*\(([^)]*)\)\s*\{/g;
    let match;
    
    while ((match = regex.exec(code)) !== null) {
      const id = match[1];
      const startIndex = match.index + match[0].length - 1; // start index of '{'
      
      let braceCount = 1;
      let endIndex = startIndex + 1;
      while (braceCount > 0 && endIndex < code.length) {
        const char = code[endIndex];
        if (char === "{") braceCount++;
        else if (char === "}") braceCount--;
        endIndex++;
      }
      
      const body = code.substring(startIndex, endIndex);
      const fullModuleCode = `function(${match[2]}) ${body}`;
      
      // Analyze file keywords to guess names
      let name = `Module ${id}`;
      const cleanBody = body.substring(0, 1500);
      if (cleanBody.includes("cfooter_container")) name = `CFooter.js (ID: ${id})`;
      else if (cleanBody.includes("cheader_container")) name = `CHeader.js (ID: ${id})`;
      else if (cleanBody.includes("login/userlogin")) name = `Login.js (ID: ${id})`;
      else if (cleanBody.includes("login/emailregister")) name = `Register.js (ID: ${id})`;
      else if (cleanBody.includes("resetpass")) name = `ResetPassword.js (ID: ${id})`;
      else if (cleanBody.includes("getviewjson")) name = `IndexPage.js (ID: ${id})`;
      else if (cleanBody.includes("BranchesOutlined")) name = `BranchesIcon.js (ID: ${id})`;
      else if (cleanBody.includes("PoweroffOutlined")) name = `PoweroffIcon.js (ID: ${id})`;
      else if (cleanBody.includes("MenuUnfoldOutlined")) name = `MenuUnfoldIcon.js (ID: ${id})`;
      else if (cleanBody.includes("MenuFoldOutlined")) name = `MenuFoldIcon.js (ID: ${id})`;
      else if (cleanBody.includes("istokenvalid")) name = `AuthAPI.js (ID: ${id})`;
      else if (cleanBody.includes("HXBILL")) name = `BillGlobals.js (ID: ${id})`;
      
      modules.push({
        id,
        code: fullModuleCode,
        name
      });
    }

    setUnpackedModules(modules);
    if (modules.length > 0) {
      setSelectedModule(modules[0]);
      setSourceMapStatus(`Successfully unpacked ${modules.length} modules!`);
    } else {
      setSourceMapStatus("Could not find standard Webpack module pattern.");
    }
  };

  // Parse and build original directory tree from Source Map JSON
  const handleParseSourceMap = (mapStr: string) => {
    try {
      setSourceMapError("");
      const map = JSON.parse(mapStr);
      if (!map.sources || !map.sourcesContent) {
        throw new Error("Invalid Source Map: 'sources' or 'sourcesContent' array is missing.");
      }
      
      // Recursively nest flat paths
      const root: FileNode = { name: "Restored Project", path: "root", type: "directory", children: [] };
      
      map.sources.forEach((sourcePath: string, index: number) => {
        // Strip out webpack:/// or dot prefixes
        const normalized = sourcePath.replace(/^webpack:\/\/\/\.?\/?/, "").replace(/^\.\//, "");
        const parts = normalized.split("/");
        const content = map.sourcesContent[index] || "";
        
        let current = root;
        let accumulatedPath = "";
        
        parts.forEach((part: string, partIndex: number) => {
          accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
          const isLast = partIndex === parts.length - 1;
          
          if (!current.children) current.children = [];
          let nextNode = current.children.find(child => child.name === part);
          
          if (!nextNode) {
            nextNode = {
              name: part,
              path: accumulatedPath,
              type: isLast ? "file" : "directory"
            };
            if (isLast) {
              nextNode.content = content;
            } else {
              nextNode.children = [];
            }
            current.children.push(nextNode);
          }
          current = nextNode;
        });
      });

      // Pre-sort files and directories
      const sortTree = (node: FileNode) => {
        if (node.children) {
          node.children.sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          node.children.forEach(sortTree);
        }
      };
      sortTree(root);

      setFileTree(root);
      setSourceMapStatus(`Successfully reconstructed source tree containing ${map.sources.length} original source files.`);
      
      // Auto-select first file
      const findFirstFile = (node: FileNode): FileNode | null => {
        if (node.type === "file") return node;
        if (node.children && node.children.length > 0) {
          for (let child of node.children) {
            const f = findFirstFile(child);
            if (f) return f;
          }
        }
        return null;
      };
      const first = findFirstFile(root);
      if (first) {
        setSelectedFile(first);
      }
      
      // Expand root by default
      setExpandedNodes({ "root": true });
    } catch (e: any) {
      setSourceMapError(e.message || "Failed to parse Source Map JSON.");
    }
  };

  // Load static preset demo data for instantaneous showcase
  const loadDemoData = () => {
    setMinifiedJs(DEMO_JS);
    setSourceMapJson(JSON.stringify(DEMO_SOURCE_MAP, null, 2));
    setPackedJs(DEMO_JS);
    setScratchpadInput(
      `65456:function(e,t,n){"use strict";n.d(t,{Z:function(){return g}});var r=n(27853),o=n(84531),a=n(81020),i=n(42301),c=n(72791),l=n(66106),u=n(30914),s="cheader_container__4rwJ8",f="cheader_header__qdnzC",d="cheader_logoDiv__y0God",p="cheader_hydl__VG9rN",m=n(85093),v=n(80184),g=function(e){(0,a.Z)(n,e);var t=(0,i.Z)(n);function n(e){var o;return(0,r.Z)(this,n),(o=t.call(this,e)).doregister=function(){m.Z.push({pathname:"/register"}),m.Z.go()},o.state={isShowBtn:!0},o}return(0,o.Z)(n,[{key:"componentDidMount",value:function(){"register"===this.props.type?this.setState({isShowBtn:!1}):this.setState({isShowBtn:!0})}},{key:"render",value:function(){return(0,v.jsx)("div",{offsetTop:0,className:s,children:(0,v.jsx)(l.Z,{className:f,children:(0,v.jsxs)(u.Z,{offset:4,span:8,children:[" ",(0,v.jsx)("label",{className:d,children:"AAABBB"})," ",(0,v.jsx)("label",{className:p,children:" \\u6b22\\u8fce\\u767b\\u5f55"})]})})})}}]),n}(c.Component)}`
    );
    setScratchpadContext("This is CHeader.js module belonging to an Ant Design React website deployed on Tomcat");
    handleParseSourceMap(JSON.stringify(DEMO_SOURCE_MAP));
    handleUnpackWebpack(DEMO_JS);
  };

  // ZIP Downloader using JSZip
  const downloadOriginalSourceZip = async () => {
    if (!fileTree) return;
    setSourceMapStatus("Generating ZIP archive...");
    const zip = new JSZip();

    const addNodeToZip = (node: FileNode, folderPath: string) => {
      if (node.type === "file" && node.content) {
        const fileLoc = folderPath ? `${folderPath}/${node.name}` : node.name;
        zip.file(fileLoc, node.content);
      } else if (node.type === "directory" && node.children) {
        const newFolder = folderPath ? `${folderPath}/${node.name}` : node.name;
        node.children.forEach(child => addNodeToZip(child, newFolder));
      }
    };

    if (fileTree.children) {
      fileTree.children.forEach(child => addNodeToZip(child, ""));
    }

    try {
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = "restored_source_tree.zip";
      link.click();
      setSourceMapProgress("ZIP download initialized successfully!");
    } catch (err) {
      console.error(err);
      alert("ZIP generation failed.");
    }
  };

  // AI-Assisted Deobfuscation (Gemini-backed call via Server)
  const callAiDeobfuscator = async (codeSnippet: string) => {
    if (!codeSnippet.trim()) return;
    setIsDeobfuscating(true);
    let interval: NodeJS.Timeout;
    let messageIndex = 0;
    const loadingMessages = [
      "Deobfuscating code with Gemini 3.5...",
      "Resolving standard Antd/Webpack patterns...",
      "Renaming variables to descriptive English terms...",
      "Adding documentation comments based on logic flow...",
      "Formatting with clean syntax style..."
    ];
    setAiProgressMessage(loadingMessages[0]);
    interval = setInterval(() => {
      messageIndex = (messageIndex + 1) % loadingMessages.length;
      setAiProgressMessage(loadingMessages[messageIndex]);
    }, 2500);

    try {
      const res = await fetch("/api/gemini/deobfuscate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeSnippet,
          context: scratchpadContext || "Generic React/Webpack minified JavaScript"
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      // Strip out markdown code blocks if any
      let cleanOutput = data.result || "";
      if (cleanOutput.includes("```")) {
        const matches = cleanOutput.match(/```(?:javascript|js)?([\s\S]*?)```/);
        if (matches && matches[1]) {
          cleanOutput = matches[1].trim();
        }
      }
      setScratchpadOutput(cleanOutput);

      // Also get explanation in parallel
      const explainRes = await fetch("/api/gemini/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeSnippet })
      });
      if (explainRes.ok) {
        const explainData = await explainRes.json();
        setAiExplainText(explainData.result || "No explanation returned.");
      }
    } catch (err: any) {
      console.error(err);
      alert("AI deobfuscation failed: " + err.message);
    } finally {
      clearInterval(interval);
      setIsDeobfuscating(false);
    }
  };

  const [sourceMapProgress, setSourceMapProgress] = useState("");

  // Handle uploaded files
  const handleJsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setMinifiedJs(content);
        setPackedJs(content);
        handleUnpackWebpack(content);
      };
      reader.readAsText(file);
    }
  };

  const handleMapFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setSourceMapJson(content);
        handleParseSourceMap(content);
      };
      reader.readAsText(file);
    }
  };

  // Toggle directory node collapse/expand
  const toggleNode = (nodePath: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  };

  // Filter unpacked modules
  const filteredModules = useMemo(() => {
    return unpackedModules.filter(
      mod =>
        mod.id.toLowerCase().includes(searchModuleQuery.toLowerCase()) ||
        mod.name.toLowerCase().includes(searchModuleQuery.toLowerCase())
    );
  }, [unpackedModules, searchModuleQuery]);

  // Tree Renderer Helper
  const renderTree = (node: FileNode, level = 0) => {
    const isExpanded = expandedNodes[node.path];
    const isSelected = selectedFile?.path === node.path;

    if (node.type === "directory") {
      return (
        <div key={node.path} className="select-none">
          <div
            onClick={() => toggleNode(node.path)}
            className="flex items-center gap-2 py-1 px-2 hover:bg-slate-800/60 rounded cursor-pointer transition-colors duration-150"
            style={{ paddingLeft: `${level * 16 + 8}px` }}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <span className="text-sm font-medium text-slate-200">{node.name}</span>
          </div>
          {isExpanded && node.children?.map(child => renderTree(child, level + 1))}
        </div>
      );
    } else {
      return (
        <div
          key={node.path}
          onClick={() => setSelectedFile(node)}
          className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer transition-all duration-150 ${
            isSelected
              ? "bg-indigo-600/35 text-white border-l-2 border-indigo-500"
              : "hover:bg-slate-800/40 text-slate-300 hover:text-slate-100"
          }`}
          style={{ paddingLeft: `${level * 16 + 24}px` }}
        >
          <FileCode className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-sm font-mono truncate">{node.name}</span>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Premium Navbar */}
      <header className="border-b border-slate-800/70 bg-slate-900/80 backdrop-blur sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight font-display bg-gradient-to-r from-white via-slate-200 to-indigo-400 bg-clip-text text-transparent">
              Reverse Engineering Studio
            </h1>
            <p className="text-xs text-slate-400">
              Webpack / Vite Bundle Unpacker & AI Source Map Reconstructor
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={loadDemoData}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all duration-200 shadow-lg shadow-indigo-500/20 active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            加载演示工程 (Demo Data)
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800/80 gap-1.5 p-1 bg-slate-900/60 rounded-xl max-w-md w-full self-center md:self-start">
          <button
            onClick={() => setActiveTab("sourcemap")}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-200 ${
              activeTab === "sourcemap"
                ? "bg-slate-800 text-white shadow-sm border border-slate-700/50"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileJson className="w-4 h-4" />
            Source Map Reconstruct
          </button>
          <button
            onClick={() => setActiveTab("unpacker")}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-200 ${
              activeTab === "unpacker"
                ? "bg-slate-800 text-white shadow-sm border border-slate-700/50"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            Bundle Unpacker
          </button>
          <button
            onClick={() => setActiveTab("scratchpad")}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-200 ${
              activeTab === "scratchpad"
                ? "bg-slate-800 text-white shadow-sm border border-slate-700/50"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Terminal className="w-4 h-4" />
            AI Code Scratchpad
          </button>
        </div>

        {/* Tab 1: Source Map Restorer */}
        {activeTab === "sourcemap" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Input Options Column */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-3">
                  <Upload className="w-4 h-4 text-indigo-400" />
                  载入混淆资源 (Load Resources)
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  通过导入对应的 .js 文件及包含 sourcesContent 的 .map 文件，恢复极具可读性的原始工程目录。
                </p>

                {/* Minified JS upload */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    Minified JS File (.js)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleJsFileUpload}
                      accept=".js"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 py-2 px-3 text-xs font-semibold border border-slate-800 bg-slate-950/80 hover:bg-slate-800/70 text-slate-300 hover:text-white rounded-lg flex items-center justify-center gap-1.5 transition"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-400" />
                      选择或拖入 .js
                    </button>
                    {minifiedJs && (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 flex items-center font-medium">
                        已载入
                      </span>
                    )}
                  </div>
                </div>

                {/* Source Map Upload */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    Source Map File (.js.map)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      ref={mapInputRef}
                      onChange={handleMapFileUpload}
                      accept=".map,json"
                      className="hidden"
                    />
                    <button
                      onClick={() => mapInputRef.current?.click()}
                      className="flex-1 py-2 px-3 text-xs font-semibold border border-slate-800 bg-slate-950/80 hover:bg-slate-800/70 text-slate-300 hover:text-white rounded-lg flex items-center justify-center gap-1.5 transition"
                    >
                      <FileJson className="w-3.5 h-3.5 text-slate-400" />
                      选择或拖入 .map
                    </button>
                    {sourceMapJson && (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 flex items-center font-medium">
                        已载入
                      </span>
                    )}
                  </div>
                </div>

                {sourceMapError && (
                  <div className="p-3.5 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 text-xs flex gap-2 mb-4">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{sourceMapError}</span>
                  </div>
                )}

                {sourceMapStatus && (
                  <div className="p-3 bg-indigo-500/10 text-indigo-300 rounded-xl border border-indigo-500/20 text-[11px] font-mono leading-relaxed truncate">
                    {sourceMapStatus}
                  </div>
                )}
              </div>

              {/* Directory Structure Tree */}
              {fileTree && (
                <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl flex flex-col h-[400px]">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-400" />
                      原始代码树 (Reconstructed Tree)
                    </h3>
                    <button
                      onClick={downloadOriginalSourceZip}
                      className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition"
                      title="Download All as ZIP"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                    {fileTree.children?.map(child => renderTree(child, 0))}
                  </div>
                </div>
              )}
            </div>

            {/* Code Viewer Panel */}
            <div className="lg:col-span-8 flex flex-col gap-6 h-full">
              <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-xl flex flex-col overflow-hidden h-[632px]">
                {selectedFile ? (
                  <>
                    {/* Header */}
                    <div className="border-b border-slate-800/80 bg-slate-950/40 px-5 py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <FileCode className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-mono font-medium text-slate-300 truncate">
                          {selectedFile.path}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setScratchpadInput(selectedFile.content || "");
                            setScratchpadContext(`Reconstructed file: ${selectedFile.name}`);
                            setActiveTab("scratchpad");
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-indigo-200 border border-indigo-500/20 rounded-lg transition duration-150"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          导入AI重命名/说明
                        </button>
                        <button
                          onClick={() => handleCopy(selectedFile.content || "", "reconstructed-file")}
                          className="p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded-lg transition"
                          title="Copy Code"
                        >
                          {copiedText === "reconstructed-file" ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Code Display */}
                    <div className="flex-1 overflow-y-auto bg-slate-950/80 p-5 font-mono text-xs leading-relaxed custom-scrollbar text-slate-300">
                      <pre className="whitespace-pre-wrap select-text">
                        <code>{selectedFile.content}</code>
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-3">
                    <Code className="w-12 h-12 text-slate-700" />
                    <div>
                      <p className="text-sm font-medium text-slate-400">未选择文件</p>
                      <p className="text-xs text-slate-500 max-w-sm mt-1">
                        请在左侧文件树中点击一个文件，或导入一个 Source Map 工程以显示其原始代码。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Webpack / Vite Bundle Unpacker */}
        {activeTab === "unpacker" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column - Modules List */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Webpack / Vite 模块解包
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  由于 Webpack 会把所有模块打包进一个字典，本算法能够精确识别出所有模块、进行解包并拆分成多文件独立模式。
                </p>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    选择或粘贴 minified JS 文件 (Paste Packed JS)
                  </label>
                  <textarea
                    value={packedJs}
                    onChange={(e) => {
                      setPackedJs(e.target.value);
                      handleUnpackWebpack(e.target.value);
                    }}
                    placeholder="粘贴 packed js (如 main.xxxxx.js)..."
                    className="w-full h-32 bg-slate-950/80 border border-slate-800 rounded-lg p-3 font-mono text-[10px] text-slate-300 focus:outline-none focus:border-indigo-500 custom-scrollbar resize-none"
                  />
                </div>

                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={unpackerFileInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const r = new FileReader();
                        r.onload = (event) => {
                          const content = event.target?.result as string;
                          setPackedJs(content);
                          handleUnpackWebpack(content);
                        };
                        r.readAsText(file);
                      }
                    }}
                    accept=".js"
                    className="hidden"
                  />
                  <button
                    onClick={() => unpackerFileInputRef.current?.click()}
                    className="flex-1 py-2 px-3 text-xs font-semibold bg-slate-950 border border-slate-800 hover:bg-slate-800/70 text-slate-300 rounded-lg flex items-center justify-center gap-1.5 transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    导入文件开始解包
                  </button>
                </div>
              </div>

              {/* Unpacked Module Browser */}
              {unpackedModules.length > 0 && (
                <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl flex flex-col h-[400px]">
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold text-slate-300 mb-2">
                      解析出 {unpackedModules.length} 个独立模块 (Modules List)
                    </h4>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
                      <input
                        type="text"
                        value={searchModuleQuery}
                        onChange={(e) => setSearchModuleQuery(e.target.value)}
                        placeholder="检索模块 ID 或名称..."
                        className="w-full pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                    {filteredModules.map((mod) => (
                      <button
                        key={mod.id}
                        onClick={() => setSelectedModule(mod)}
                        className={`w-full text-left py-2 px-3 rounded-lg text-xs font-mono flex items-center justify-between transition-all duration-150 ${
                          selectedModule?.id === mod.id
                            ? "bg-indigo-600/35 text-white border-l-2 border-indigo-500"
                            : "hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <span className="truncate">{mod.name}</span>
                        <span className="text-[10px] text-slate-500 scale-90 shrink-0 font-sans">
                          {mod.code.length} 字节
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Selected Module Code Viewer */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-xl flex flex-col overflow-hidden h-[632px]">
                {selectedModule ? (
                  <>
                    {/* Header */}
                    <div className="border-b border-slate-800/80 bg-slate-950/40 px-5 py-3.5 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-bold text-slate-100 font-display">
                          {selectedModule.name}
                        </span>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Module ID: {selectedModule.id} | Size: {selectedModule.code.length} bytes
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setScratchpadInput(selectedModule.code);
                            setScratchpadContext(`Webpack Module ID: ${selectedModule.id}. Heuristically identified as: ${selectedModule.name}`);
                            setActiveTab("scratchpad");
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-lg transition"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          导入到AI模块逆向
                        </button>
                        <button
                          onClick={() => handleCopy(selectedModule.code, "unpacked-module")}
                          className="p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded-lg transition"
                          title="Copy Code"
                        >
                          {copiedText === "unpacked-module" ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Code view */}
                    <div className="flex-1 overflow-y-auto bg-slate-950/80 p-5 font-mono text-xs leading-relaxed custom-scrollbar text-slate-300">
                      <pre className="whitespace-pre-wrap select-text">
                        <code>{selectedModule.code}</code>
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-3">
                    <Layers2 className="w-12 h-12 text-slate-700" />
                    <div>
                      <p className="text-sm font-medium text-slate-400">未选择模块</p>
                      <p className="text-xs text-slate-500 max-w-sm mt-1">
                        请在左侧模块列表中选择一个模块以显示其具体的 Webpack 单体代码。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: AI Code Scratchpad */}
        {activeTab === "scratchpad" && (
          <div className="flex flex-col gap-6">
            {/* Split Play area */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Input Area */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-400" />
                      待逆向的混淆代码
                    </h3>
                    <button
                      onClick={() => handleCopy(scratchpadInput, "scratchpad-input")}
                      className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded-lg transition"
                    >
                      {copiedText === "scratchpad-input" ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <textarea
                    value={scratchpadInput}
                    onChange={(e) => setScratchpadInput(e.target.value)}
                    placeholder="粘贴你想分析、还原变量名的任何混淆/压缩 JavaScript 代码片段到这里..."
                    className="w-full flex-1 min-h-[300px] bg-slate-950/80 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500 custom-scrollbar resize-none"
                  />

                  {/* Optional developer context */}
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5 text-indigo-400" />
                      补充代码背景信息 (Optional Context)
                    </label>
                    <input
                      type="text"
                      value={scratchpadContext}
                      onChange={(e) => setScratchpadContext(e.target.value)}
                      placeholder="例: 此代码为 Tomcat 环境下使用的 Login 模块，使用的框架为 Ant Design React..."
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Buttons */}
                  <div className="mt-5 flex gap-3">
                    <button
                      onClick={() => callAiDeobfuscator(scratchpadInput)}
                      disabled={!scratchpadInput || isDeobfuscating}
                      className="flex-1 py-2.5 px-4 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg flex items-center justify-center gap-2 transition-all duration-150 shadow-lg shadow-indigo-500/20 active:scale-95 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      AI 变量还原 & 格式化
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Column */}
              <div className="lg:col-span-2 flex flex-col justify-center items-center gap-3">
                <div className="hidden lg:flex p-3 bg-slate-900 border border-slate-800/80 rounded-full text-slate-500 shadow-md">
                  <ArrowRight className="w-6 h-6 animate-pulse" />
                </div>
              </div>

              {/* Output Reconstructed Code Area */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl flex flex-col flex-1 h-[450px]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 animate-bounce" />
                      AI 还原后的可读修改版本
                    </h3>
                    <button
                      onClick={() => handleCopy(scratchpadOutput, "scratchpad-output")}
                      disabled={!scratchpadOutput}
                      className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded-lg transition disabled:opacity-30"
                    >
                      {copiedText === "scratchpad-output" ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <div className="flex-1 bg-slate-950/80 border border-slate-850 rounded-lg p-4 font-mono text-xs leading-relaxed overflow-y-auto custom-scrollbar text-slate-200">
                    {isDeobfuscating ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-3">
                        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                        <div>
                          <p className="text-xs font-semibold text-slate-300">{aiProgressMessage}</p>
                          <p className="text-[10px] text-slate-500 mt-1 max-w-xs leading-normal">
                            请稍等。正在通过 Gemini 分析局部调用并转换压缩名称...
                          </p>
                        </div>
                      </div>
                    ) : scratchpadOutput ? (
                      <pre className="whitespace-pre-wrap select-text">
                        <code>{scratchpadOutput}</code>
                      </pre>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-600 gap-2">
                        <Cpu className="w-10 h-10 text-slate-800" />
                        <p className="text-xs">等待 AI 逆向反编译指令输入...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Explanation Accordion if exists */}
            {aiExplainText && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <button
                  onClick={() => setShowAiExplain(!showAiExplain)}
                  className="w-full flex items-center justify-between font-semibold text-sm text-slate-100 hover:text-indigo-300 transition"
                >
                  <span className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-indigo-400" />
                    查看该段代码逻辑详细说明 (Code Explanation)
                  </span>
                  {showAiExplain ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {showAiExplain && (
                  <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-300 font-mono leading-relaxed bg-slate-950/60 p-4 rounded-xl border border-slate-850 whitespace-pre-wrap">
                    {aiExplainText}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer System Indicator */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 mt-12 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <div>
          <span>STUDIO STATUS: </span>
          <span className="text-emerald-400 font-semibold animate-pulse">● ACTIVE</span>
        </div>
        <div>
          <span>PORT: 3000 | PLATFORM: GOOGLE CLOUD SANDBOX</span>
        </div>
      </footer>
    </div>
  );
}

/* =========================================================
   VAULT — Fault-Tolerant Distributed Object Storage Engine
   script.js
   Sections:
     1. Utility hashing helpers
     2. Consistent hash ring
     3. Raft consensus manager
     4. Merkle tree anti-entropy engine
     5. Vault cluster engine (core simulation + rendering)
     6. Tab / modal / chaos control functions
     7. Interactive particle background
     8. Boot / splash sequence
     9. Guided tour (full-site)
     10. Theme (light/dark) system
     11. Account system (sign in / out)
     12. Global search
     13. Tools: screenshot + PDF guide generator
     14. Keyboard shortcuts
     15. Tips & best practices content
     16. Misc UI polish (ripple buttons)
   ========================================================= */

/* ---------------------------------------------------------
   1. Utility Functions
   --------------------------------------------------------- */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function generateHashHex(seed) {
    const hex = '0123456789abcdef';
    let res = '';
    for (let i = 0; i < 12; i++) {
        res += hex[Math.floor(Math.abs(Math.sin(seed + i)) * 16)];
    }
    return res;
}

/* ---------------------------------------------------------
   2. Consistent Hash Ring
   --------------------------------------------------------- */
class ConsistentHashRing {
    constructor(replicas = 3) {
        this.replicas = replicas;
        this.ring = new Map();
        this.keys = [];
    }

    addNode(nodeId) {
        for (let i = 0; i < this.replicas; i++) {
            const vnodeKey = `${nodeId}-vnode-${i}`;
            const hash = simpleHash(vnodeKey) % 360;
            this.ring.set(hash, nodeId);
            this.keys.push(hash);
        }
        this.keys.sort((a, b) => a - b);
    }

    removeNode(nodeId) {
        for (let i = 0; i < this.replicas; i++) {
            const vnodeKey = `${nodeId}-vnode-${i}`;
            const hash = simpleHash(vnodeKey) % 360;
            this.ring.delete(hash);
        }
        this.keys = this.keys.filter(k => this.ring.has(k));
    }

    getNodesForObject(objectKey, count = 3) {
        if (this.keys.length === 0) return [];
        const hash = simpleHash(objectKey) % 360;
        const nodes = new Set();
        let startIndex = this.keys.findIndex(k => k >= hash);
        if (startIndex === -1) startIndex = 0;

        for (let i = 0; i < this.keys.length && nodes.size < count; i++) {
            const idx = (startIndex + i) % this.keys.length;
            nodes.add(this.ring.get(this.keys[idx]));
        }
        return Array.from(nodes);
    }
}

/* ---------------------------------------------------------
   3. Raft Consensus Manager
   --------------------------------------------------------- */
class RaftConsensusManager {
    constructor(cluster) {
        this.cluster = cluster;
        this.term = 14;
        this.leader = 'Node-01';
        this.commitIndex = 1048;
        this.logs = [
            { index: 1046, term: 14, cmd: 'PUT chunk_0x8f3a (N1, N2, N3)' },
            { index: 1047, term: 14, cmd: 'HEARTBEAT quorum state sync ok' },
            { index: 1048, term: 14, cmd: 'COMMIT ai-model-weights-v2.bin' }
        ];
    }

    triggerElection() {
        this.term++;
        const healthyNodes = this.cluster.nodes.filter(n => n.status === 'Healthy');
        if (healthyNodes.length === 0) {
            this.leader = 'NONE (NO QUORUM)';
            vaultEngine.logEvent('ERROR', 'RAFT', `Election failed! No healthy nodes in cluster.`);
            return;
        }
        const randomLeader = healthyNodes[Math.floor(Math.random() * healthyNodes.length)].id;
        this.leader = randomLeader;
        this.logs.push({
            index: ++this.commitIndex,
            term: this.term,
            cmd: `LEADER_ELECTION ${randomLeader} elected for term ${this.term}`
        });
        vaultEngine.logEvent('WARN', 'RAFT', `Leader election triggered! ${randomLeader} won Term ${this.term}`);
        this.updateUI();
    }

    updateUI() {
        const leaderBadge = document.getElementById('raft-leader-badge');
        if (leaderBadge) {
            leaderBadge.innerHTML = `<i class="fa-solid fa-crown text-amber-400 text-[10px]"></i> ${this.leader}`;
        }

        const termElem = document.getElementById('raft-term-val');
        const leaderElem = document.getElementById('raft-leader-val');
        const commitElem = document.getElementById('raft-commit-val');

        if (termElem) termElem.innerText = `Term ${this.term}`;
        if (leaderElem) leaderElem.innerText = this.leader;
        if (commitElem) commitElem.innerText = `#${this.commitIndex}`;

        const rolesContainer = document.getElementById('raft-nodes-roles');
        if (rolesContainer) {
            rolesContainer.innerHTML = this.cluster.nodes.map(n => {
                let role = n.id === this.leader ? 'LEADER' : (n.status === 'Dead' ? 'OFFLINE' : 'FOLLOWER');
                let badgeColor = role === 'LEADER' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : (role === 'OFFLINE' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-gray-800 text-gray-400 border-gray-700');
                return `<div class="p-2 rounded-xl border ${badgeColor} flex justify-between items-center">
                    <span>${n.id}</span>
                    <span class="font-bold text-[10px]">${role}</span>
                </div>`;
            }).join('');
        }

        const logsContainer = document.getElementById('raft-log-entries');
        if (logsContainer) {
            logsContainer.innerHTML = this.logs.slice(-6).reverse().map(l => `
                <div class="flex items-center justify-between text-gray-300">
                    <span><span class="text-cyan-400">#${l.index}</span> [Term ${l.term}] ${l.cmd}</span>
                    <span class="text-emerald-400 text-[10px]">COMMITTED</span>
                </div>
            `).join('');
        }
    }
}

/* ---------------------------------------------------------
   4. Merkle Tree Anti-Entropy Engine
   --------------------------------------------------------- */
class MerkleTreeEngine {
    constructor(cluster) {
        this.cluster = cluster;
    }

    runAntiEntropyCheck() {
        vaultEngine.logEvent('INFO', 'ANTI-ENTROPY', 'Initiating Merkle Tree verification across replicas...');

        let corruptedFound = false;
        this.cluster.objects.forEach(obj => {
            obj.chunks.forEach(chunk => {
                if (chunk.corrupted) {
                    corruptedFound = true;
                    vaultEngine.logEvent('ERROR', 'BIT-ROT', `Merkle hash mismatch detected for ${chunk.id}! Reconstructing from healthy replicas...`);
                    setTimeout(() => {
                        chunk.corrupted = false;
                        vaultEngine.logEvent('SUCCESS', 'SELF-HEAL', `Successfully auto-repaired ${chunk.id} checksum match restored.`);
                        vaultEngine.updateAllViews();
                    }, 1200);
                }
            });
        });

        if (!corruptedFound) {
            vaultEngine.logEvent('SUCCESS', 'ANTI-ENTROPY', 'Merkle Tree hash check complete. All replicas 100% consistent.');
        }
        this.renderMerkleGraphic();
    }

    renderMerkleGraphic() {
        const container = document.getElementById('merkle-tree-graphic');
        if (!container) return;

        const rootHash = generateHashHex(42);
        const leftChild = generateHashHex(12);
        const rightChild = generateHashHex(88);

        container.innerHTML = `
            <div class="text-center">
                <span class="text-gray-500 text-[10px]">ROOT MERKLE HASH</span>
                <div class="px-3 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded inline-block font-bold mt-0.5">
                    0x${rootHash}
                </div>
            </div>
            <div class="flex justify-around items-center pt-2 border-t border-gray-800">
                <div class="text-center">
                    <span class="text-gray-500 text-[10px]">Leaf Range 0x00-0x7F</span>
                    <div class="px-2 py-0.5 bg-gray-900 text-gray-300 border border-gray-700 rounded mt-0.5">
                        0x${leftChild}
                    </div>
                </div>
                <div class="text-center">
                    <span class="text-gray-500 text-[10px]">Leaf Range 0x80-0xFF</span>
                    <div class="px-2 py-0.5 bg-gray-900 text-gray-300 border border-gray-700 rounded mt-0.5">
                        0x${rightChild}
                    </div>
                </div>
            </div>
        `;
    }
}

/* ---------------------------------------------------------
   5. Vault Cluster Engine
   --------------------------------------------------------- */
class VaultClusterEngine {
    constructor() {
        this.nodes = [
            { id: 'Node-01', az: 'AZ-1', status: 'Healthy', cpu: 28, storage: 42, activeChunks: 18 },
            { id: 'Node-02', az: 'AZ-1', status: 'Healthy', cpu: 34, storage: 51, activeChunks: 22 },
            { id: 'Node-03', az: 'AZ-2', status: 'Healthy', cpu: 19, storage: 38, activeChunks: 16 },
            { id: 'Node-04', az: 'AZ-2', status: 'Healthy', cpu: 45, storage: 64, activeChunks: 28 },
            { id: 'Node-05', az: 'AZ-3', status: 'Healthy', cpu: 22, storage: 30, activeChunks: 14 },
            { id: 'Node-06', az: 'AZ-3', status: 'Healthy', cpu: 31, storage: 48, activeChunks: 20 }
        ];

        this.hashRing = new ConsistentHashRing(3);
        this.nodes.forEach(n => this.hashRing.addNode(n.id));

        this.objects = [
            {
                name: 'ai-model-weights-v2.bin',
                size: 256,
                chunks: [
                    { id: 'chk-01', hash: '8f3a92b', primaryNode: 'Node-01', replicaNodes: ['Node-02', 'Node-03'], corrupted: false },
                    { id: 'chk-02', hash: '4c7e10d', primaryNode: 'Node-04', replicaNodes: ['Node-05', 'Node-06'], corrupted: false },
                    { id: 'chk-03', hash: '9b2e11a', primaryNode: 'Node-02', replicaNodes: ['Node-03', 'Node-05'], corrupted: false },
                    { id: 'chk-04', hash: '1d6f44e', primaryNode: 'Node-06', replicaNodes: ['Node-01', 'Node-04'], corrupted: false }
                ]
            },
            {
                name: 'customer-database.dump',
                size: 128,
                chunks: [
                    { id: 'chk-05', hash: '7e2c91a', primaryNode: 'Node-03', replicaNodes: ['Node-04', 'Node-01'], corrupted: false },
                    { id: 'chk-06', hash: '3a1d82f', primaryNode: 'Node-05', replicaNodes: ['Node-06', 'Node-02'], corrupted: false }
                ]
            }
        ];

        this.telemetryHistory = Array(20).fill(14200);

        this.raft = new RaftConsensusManager(this);
        this.merkleEngine = new MerkleTreeEngine(this);

        this.initHeartbeatLoop();
    }

    initHeartbeatLoop() {
        setInterval(() => {
            this.nodes.forEach(n => {
                if (n.status === 'Healthy') {
                    n.cpu = Math.min(95, Math.max(10, n.cpu + Math.floor(Math.random() * 7 - 3)));
                }
            });

            const newIops = 14000 + Math.floor(Math.random() * 800 - 400);
            this.telemetryHistory.shift();
            this.telemetryHistory.push(newIops);

            if (Math.random() > 0.7) {
                const healthyCount = this.nodes.filter(n => n.status === 'Healthy').length;
                this.logEvent('DEBUG', 'gRPC', `Heartbeat ACK received from ${healthyCount}/6 storage nodes`);
            }

            this.updateUI();
            this.renderTelemetryChart();
        }, 2500);
    }

    logEvent(level, subsystem, msg) {
        const terminal = document.getElementById('terminal-drawer');
        if (!terminal) return;

        const time = new Date().toISOString().split('T')[1].slice(0, 8);
        let colorClass = 'text-cyan-400';
        if (level === 'WARN') colorClass = 'text-amber-400';
        if (level === 'ERROR') colorClass = 'text-rose-400';
        if (level === 'SUCCESS') colorClass = 'text-emerald-400';

        const line = document.createElement('div');
        line.className = 'flex items-start gap-2 font-mono text-[11px] hover:bg-gray-900/50 p-0.5 rounded';
        line.innerHTML = `
            <span class="text-gray-500 font-mono">[${time}]</span>
            <span class="${colorClass} font-bold">[${subsystem}]</span>
            <span class="text-gray-300 flex-1">${msg}</span>
        `;

        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;
    }

    toggleNodeStatus(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;

        if (node.status === 'Healthy') {
            node.status = 'Dead';
            node.cpu = 0;
            this.hashRing.removeNode(nodeId);
            this.logEvent('ERROR', 'NODE-CRASH', `Node ${nodeId} (${node.az}) CRASHED! Re-routing ring key ranges...`);

            if (this.raft.leader === nodeId) {
                this.raft.triggerElection();
            }
        } else {
            node.status = 'Healthy';
            node.cpu = 25;
            this.hashRing.addNode(nodeId);
            this.logEvent('SUCCESS', 'RECOVER', `Node ${nodeId} back online. Triggering Merkle Tree anti-entropy sync...`);
            this.merkleEngine.runAntiEntropyCheck();
        }

        this.updateAllViews();
    }

    injectBitRot(chunkId) {
        let targetChunk = null;
        this.objects.forEach(o => {
            o.chunks.forEach(c => {
                if (c.id === chunkId) targetChunk = c;
            });
        });

        if (targetChunk) {
            targetChunk.corrupted = true;
            this.logEvent('ERROR', 'BIT-ROT', `Silent bit-rot injected into ${chunkId}! Checksum hash modified on disk.`);
            this.updateAllViews();
        }
    }

    updateAllViews() {
        this.renderNodeCards();
        this.renderObjectsList();
        this.drawHashRing();
        this.raft.updateUI();
        this.merkleEngine.renderMerkleGraphic();
        this.updateHeaderStats();
    }

    updateUI() {
        this.renderNodeCards();
        this.drawHashRing();
    }

    updateHeaderStats() {
        const healthyCount = this.nodes.filter(n => n.status === 'Healthy').length;
        const quorumElem = document.getElementById('cluster-quorum-stat');
        const statusText = document.getElementById('system-status-text');
        const ping = document.getElementById('health-ping');
        const dot = document.getElementById('health-dot');

        if (quorumElem) quorumElem.innerText = `QUORUM: ${healthyCount}/6 NODES`;

        if (healthyCount >= 4) {
            statusText.innerText = `${((healthyCount / 6) * 100).toFixed(1)}% HEALTHY`;
            statusText.className = 'text-emerald-400 font-mono font-bold';
            ping.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75';
            dot.className = 'relative inline-flex rounded-full h-3 w-3 bg-emerald-500';
        } else {
            statusText.innerText = 'QUORUM DEGRADED';
            statusText.className = 'text-rose-400 font-mono font-bold';
            ping.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75';
            dot.className = 'relative inline-flex rounded-full h-3 w-3 bg-rose-500';
        }
    }

    renderNodeCards() {
        const container = document.getElementById('nodes-grid');
        if (!container) return;

        container.innerHTML = this.nodes.map(n => {
            const isDead = n.status === 'Dead';
            const statusColor = isDead ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
            const isLeader = this.raft.leader === n.id;

            return `
                <div id="node-card-${n.id}" class="glass-card hover-lift rounded-xl p-4 border border-gray-800 flex flex-col justify-between space-y-3 relative overflow-hidden transition-all ${isDead ? 'opacity-50' : ''}">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="font-bold font-mono text-sm text-gray-200">${n.id}</span>
                            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">${n.az}</span>
                            ${isLeader ? '<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold"><i class="fa-solid fa-crown text-[9px]"></i> LEADER</span>' : ''}
                        </div>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono border ${statusColor}">${n.status}</span>
                    </div>

                    <div class="space-y-2 font-mono text-[11px]">
                        <div>
                            <div class="flex justify-between text-gray-400 mb-0.5">
                                <span>CPU LOAD</span>
                                <span class="text-gray-200">${n.cpu}%</span>
                            </div>
                            <div class="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                                <div class="bg-cyan-500 h-1.5 rounded-full" style="width: ${n.cpu}%"></div>
                            </div>
                        </div>

                        <div>
                            <div class="flex justify-between text-gray-400 mb-0.5">
                                <span>STORAGE UTIL</span>
                                <span class="text-gray-200">${n.storage}%</span>
                            </div>
                            <div class="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                                <div class="bg-purple-500 h-1.5 rounded-full" style="width: ${n.storage}%"></div>
                            </div>
                        </div>
                    </div>

                    <div class="pt-2 border-t border-gray-800 flex items-center justify-between text-xs font-mono">
                        <span class="text-gray-500 text-[10px]">${n.activeChunks} Chunks Stored</span>
                        <button onclick="vaultEngine.toggleNodeStatus('${n.id}')" class="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[11px] text-gray-300 transition-all ripple-btn">
                            ${isDead ? '<i class="fa-solid fa-power-off text-emerald-400"></i> Start' : '<i class="fa-solid fa-skull text-rose-400"></i> Kill'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderObjectsList() {
        const container = document.getElementById('objects-list-container');
        if (!container) return;

        container.innerHTML = this.objects.map(obj => `
            <div id="object-card-${obj.name.replace(/[^a-zA-Z0-9]/g, '-')}" class="glass-card hover-lift rounded-xl p-4 border border-gray-800 space-y-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <i class="fa-solid fa-file-code text-cyan-400 text-lg"></i>
                        <div>
                            <span class="font-bold font-mono text-xs text-gray-200 block">${obj.name}</span>
                            <span class="text-[10px] font-mono text-gray-400">${obj.size} MB | ${obj.chunks.length} Chunks</span>
                        </div>
                    </div>
                    <span class="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">N=3 Replicated</span>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                    ${obj.chunks.map(c => `
                        <div class="bg-gray-900/80 p-2.5 rounded-xl border ${c.corrupted ? 'border-rose-500/50 bg-rose-950/20' : 'border-gray-800'} space-y-1">
                            <div class="flex justify-between items-center">
                                <span class="font-bold ${c.corrupted ? 'text-rose-400' : 'text-gray-300'}">${c.id} (SHA: ${c.hash})</span>
                                ${c.corrupted ? '<span class="text-[9px] px-1 bg-rose-500/20 text-rose-400 border border-rose-500/40 rounded">BIT-ROT DETECTED</span>' : ''}
                            </div>
                            <div class="text-[10px] text-gray-400">
                                Primary: <span class="text-cyan-400">${c.primaryNode}</span> | Replicas: ${c.replicaNodes.join(', ')}
                            </div>
                            <div class="pt-1 flex justify-end">
                                <button onclick="vaultEngine.injectBitRot('${c.id}')" class="text-[10px] text-rose-400 hover:text-rose-300 underline">
                                    Inject Bit-Rot Corruption
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }

    drawHashRing() {
        const canvas = document.getElementById('hash-ring-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = 100;

        ctx.clearRect(0, 0, width, height);

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
        ctx.lineWidth = 10;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(31, 41, 55, 0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();

        const colorMap = {
            'AZ-1': '#06b6d4',
            'AZ-2': '#10b981',
            'AZ-3': '#a855f7'
        };

        this.hashRing.keys.forEach(hash => {
            const nodeId = this.hashRing.ring.get(hash);
            const node = this.nodes.find(n => n.id === nodeId);
            if (!node) return;

            const isDead = node.status === 'Dead';
            const angle = (hash * Math.PI) / 180;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);

            ctx.beginPath();
            ctx.arc(x, y, isDead ? 4 : 7, 0, Math.PI * 2);
            ctx.fillStyle = isDead ? '#f43f5e' : (colorMap[node.az] || '#06b6d4');
            ctx.fill();

            ctx.strokeStyle = '#0b0f19';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    renderTelemetryChart() {
        const canvas = document.getElementById('telemetry-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const step = width / (this.telemetryHistory.length - 1);
        const maxVal = 16000;
        const minVal = 12000;

        ctx.beginPath();
        this.telemetryHistory.forEach((val, idx) => {
            const x = idx * step;
            const y = height - ((val - minVal) / (maxVal - minVal)) * (height - 30) - 15;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        const latestIops = this.telemetryHistory[this.telemetryHistory.length - 1];
        const iopsElem = document.getElementById('telemetry-iops');
        if (iopsElem) iopsElem.innerText = `${latestIops.toLocaleString()} ops/s`;
    }
}

let vaultEngine;

/* ---------------------------------------------------------
   6. Tab / Modal / Chaos Controls
   --------------------------------------------------------- */
const TAB_IDS = ['topology', 'objects', 'chaos', 'consensus', 'explained', 'calculator', 'telemetry', 'tips', 'about'];

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active', 'border-cyan-400', 'text-cyan-400', 'bg-gray-900/60');
        b.classList.add('border-transparent', 'text-gray-400');
    });
    document.querySelectorAll('.tab-view').forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('tab-enter');
    });

    const targetBtn = document.getElementById(`tab-${tabId}`);
    const targetView = document.getElementById(`view-${tabId}`);

    if (targetBtn) {
        targetBtn.classList.add('active', 'border-cyan-400', 'text-cyan-400', 'bg-gray-900/60');
        targetBtn.classList.remove('border-transparent', 'text-gray-400');
    }
    if (targetView) {
        targetView.classList.remove('hidden');
        void targetView.offsetWidth;
        targetView.classList.add('tab-enter');
    }

    if (tabId === 'topology') {
        vaultEngine.drawHashRing();
    } else if (tabId === 'telemetry') {
        vaultEngine.renderTelemetryChart();
    } else if (tabId === 'tips') {
        renderTipsGrid();
    } else if (tabId === 'calculator') {
        vaultCalc.update();
    }
}

function triggerChaosPreset(presetKey) {
    if (presetKey === 'kill-leader' || presetKey === 'random-kill') {
        const activeLeader = vaultEngine.raft.leader;
        vaultEngine.logEvent('WARN', 'CHAOS', `Killing active Raft Leader ${activeLeader}...`);
        vaultEngine.toggleNodeStatus(activeLeader);
    } else if (presetKey === 'partition-az2') {
        vaultEngine.logEvent('WARN', 'CHAOS', 'Isolating Availability Zone AZ-2 nodes...');
        vaultEngine.nodes.filter(n => n.az === 'AZ-2').forEach(n => {
            if (n.status === 'Healthy') vaultEngine.toggleNodeStatus(n.id);
        });
    } else if (presetKey === 'mass-bitrot') {
        vaultEngine.logEvent('WARN', 'CHAOS', 'Injecting silent bit-rot data corruption across random replicas...');
        vaultEngine.objects.forEach(o => o.chunks.forEach(c => vaultEngine.injectBitRot(c.id)));
    } else if (presetKey === 'cascading') {
        vaultEngine.logEvent('WARN', 'CHAOS', 'Cascading failure triggered! Killing 3 nodes simultaneously...');
        vaultEngine.toggleNodeStatus('Node-01');
        vaultEngine.toggleNodeStatus('Node-03');
        vaultEngine.toggleNodeStatus('Node-05');
    } else if (presetKey === 'auto-heal') {
        vaultEngine.logEvent('SUCCESS', 'CHAOS', 'Auto-Repair Sequence: Restoring dead nodes and running anti-entropy Merkle sync...');
        vaultEngine.nodes.forEach(n => {
            if (n.status === 'Dead') vaultEngine.toggleNodeStatus(n.id);
        });
        vaultEngine.merkleEngine.runAntiEntropyCheck();
    }
}

function handleChaosSelect(val) {
    if (!val) return;
    triggerChaosPreset(val);
    document.getElementById('chaos-presets-select').value = "";
}

function toggleTerminal() {
    const drawer = document.getElementById('terminal-drawer');
    const icon = document.getElementById('terminal-toggle-icon');
    if (drawer.classList.contains('hidden')) {
        drawer.classList.remove('hidden');
        icon.className = 'fa-solid fa-chevron-up text-[10px]';
    } else {
        drawer.classList.add('hidden');
        icon.className = 'fa-solid fa-chevron-down text-[10px]';
    }
}

function clearTerminalLogs() {
    const terminal = document.getElementById('terminal-drawer');
    if (terminal) terminal.innerHTML = '';
}

function triggerUploadModal() {
    document.getElementById('upload-modal').classList.remove('hidden');
}

function closeUploadModal() {
    document.getElementById('upload-modal').classList.add('hidden');
}

function submitModalUpload() {
    const name = document.getElementById('modal-filename').value || 'object.bin';
    const size = parseInt(document.getElementById('modal-filesize').value) || 128;
    uploadPresetObject(name, size);
    closeUploadModal();
}

function triggerFileInput() {
    document.getElementById('mock-file-input').click();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        uploadPresetObject(file.name, Math.round(file.size / (1024 * 1024)) || 64);
    }
}

function uploadPresetObject(name, size) {
    const numChunks = Math.ceil(size / 64);
    const chunks = [];

    for (let i = 1; i <= numChunks; i++) {
        const chkId = `chk-${Math.floor(10 + Math.random() * 89)}`;
        const nodes = vaultEngine.hashRing.getNodesForObject(chkId, 3);
        chunks.push({
            id: chkId,
            hash: generateHashHex(i + size),
            primaryNode: nodes[0] || 'Node-01',
            replicaNodes: [nodes[1] || 'Node-02', nodes[2] || 'Node-03'],
            corrupted: false
        });
    }

    vaultEngine.objects.unshift({ name, size, chunks });
    vaultEngine.logEvent('SUCCESS', 'OBJECT-PUT', `Successfully uploaded ${name} (${size} MB). Split into ${numChunks} chunks across N=3 quorum.`);
    vaultEngine.updateAllViews();
}

/* ---------------------------------------------------------
   7. Interactive Particle Background
   --------------------------------------------------------- */
class ParticleField {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.mouse = { x: null, y: null, active: false };
        this.colors = ['#06b6d4', '#10b981', '#a855f7', '#f59e0b', '#f43f5e'];

        this.resize();
        this.initParticles();
        this.bindEvents();
        this.loop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        const count = Math.min(100, Math.floor((window.innerWidth * window.innerHeight) / 16000));
        if (this.particles.length === 0 || Math.abs(this.particles.length - count) > 15) {
            this.initParticles(count);
        }
    }

    initParticles(count) {
        const n = count || Math.min(100, Math.floor((window.innerWidth * window.innerHeight) / 16000));
        this.particles = Array.from({ length: n }, () => ({
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.35,
            r: Math.random() * 1.6 + 0.8,
            color: this.colors[Math.floor(Math.random() * this.colors.length)]
        }));
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            this.mouse.active = true;
        });
        window.addEventListener('mouseleave', () => { this.mouse.active = false; });
    }

    loop() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';

        const grad = ctx.createRadialGradient(w * 0.5, h * 0.15, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
        if (isLight) {
            grad.addColorStop(0, '#eef1f8');
            grad.addColorStop(1, '#dfe4f0');
        } else {
            grad.addColorStop(0, '#0f1729');
            grad.addColorStop(1, '#05070d');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;

            if (this.mouse.active) {
                const dx = p.x - this.mouse.x;
                const dy = p.y - this.mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 130) {
                    const force = (130 - dist) / 130;
                    p.x += (dx / dist) * force * 1.2;
                    p.y += (dy / dist) * force * 1.2;
                }
            }

            if (p.x < 0) p.x = w;
            if (p.x > w) p.x = 0;
            if (p.y < 0) p.y = h;
            if (p.y > h) p.y = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = isLight ? 0.35 : 0.55;
            ctx.fill();
            ctx.globalAlpha = 1;
        });

        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const a = this.particles[i];
                const b = this.particles[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 110) {
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.strokeStyle = 'rgba(6, 182, 212,' + (0.12 * (1 - dist / 110)) + ')';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        }

        requestAnimationFrame(() => this.loop());
    }
}

/* ---------------------------------------------------------
   8. Boot / Splash Sequence
   --------------------------------------------------------- */
class BootSequence {
    constructor() {
        this.logEl = document.getElementById('boot-log');
        this.fillEl = document.getElementById('boot-progress-fill');
        this.pctEl = document.getElementById('boot-progress-pct');
        this.labelEl = document.getElementById('boot-progress-label');
        this.screenEl = document.getElementById('boot-screen');

        this.lines = [
            { tag: 'INIT', text: 'Booting Vault distributed runtime…' },
            { tag: 'RAFT', text: 'Electing cluster leader (Node-01)…' },
            { tag: 'RING', text: 'Mapping consistent hash ring (360° / N=3)…' },
            { tag: 'MERKLE', text: 'Verifying replica checksums…' },
            { tag: 'QUORUM', text: '6/6 storage nodes healthy across 3 AZs' },
            { tag: 'READY', text: 'Vault cluster online.' }
        ];
    }

    async run() {
        if (!this.screenEl) return;
        this.hidden = false;

        this.safetyTimer = setTimeout(() => this.hide(), 6000);

        try {
            const total = this.lines.length;
            for (let i = 0; i < total; i++) {
                await this.wait(280);
                this.printLine(this.lines[i]);
                const pct = Math.round(((i + 1) / total) * 100);
                this.setProgress(pct);
            }

            if (this.labelEl) this.labelEl.textContent = 'CLUSTER READY';
            await this.wait(450);
        } catch (e) {
            console.warn('Vault: boot sequence hit an issue, skipping ahead —', e);
        } finally {
            clearTimeout(this.safetyTimer);
            this.hide();
        }
    }

    printLine(line) {
        if (!this.logEl) return;
        const div = document.createElement('div');
        div.className = 'boot-log-line';
        div.innerHTML = `<span class="tag">[${line.tag}]</span> <span class="${line.tag === 'READY' ? 'ok' : ''}">${line.text}</span>`;
        this.logEl.appendChild(div);
        this.logEl.scrollTop = this.logEl.scrollHeight;
    }

    setProgress(pct) {
        if (this.fillEl) this.fillEl.style.width = pct + '%';
        if (this.pctEl) this.pctEl.textContent = pct + '%';
    }

    hide() {
        if (!this.screenEl || this.hidden) return;
        this.hidden = true;
        this.screenEl.classList.add('boot-hidden');
        setTimeout(() => {
            this.screenEl.style.display = 'none';
            try {
                if (guidedTour && !localStorage.getItem('vault_tour_seen')) {
                    setTimeout(() => guidedTour.start(), 500);
                }
            } catch (e) {
                console.warn('Vault: guided tour auto-start skipped —', e);
            }
        }, 750);
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/* ---------------------------------------------------------
   9. Guided Tour — covers EVERY feature on the site
   --------------------------------------------------------- */
class GuidedTour {
    constructor() {
        this.steps = [
            {
                selector: '.logo-pulse',
                title: 'Welcome to Vault',
                text: 'Vault simulates a fault-tolerant distributed object storage cluster, entirely in your browser. This full tour walks through every panel, button, and shortcut on the site — nothing left unexplained.'
            },
            {
                selector: '[data-tour="search-bar"]',
                title: 'Global Search',
                text: 'Type here to instantly search across storage nodes, uploaded objects, data chunks, and tips. Press "/" anywhere on the page to jump straight into this box. Click a result to be taken to it.'
            },
            {
                selector: '[data-tour="btn-upload"]',
                title: 'Upload Object',
                text: 'Simulates uploading a file into the cluster. Set a filename and size (or browse a real local file) — Vault will shard it into 64MB chunks and replicate each chunk across 3 nodes automatically.'
            },
            {
                selector: '[data-tour="btn-chaos"]',
                title: 'Quick Chaos Presets',
                text: 'This dropdown is always available — trigger any chaos scenario (kill the leader, partition a zone, corrupt data, cascade failures, or auto-heal) from anywhere in the app.'
            },
            {
                selector: '[data-tour="btn-tour"]',
                title: 'Guided Tour (this button)',
                text: 'Restart this full-site tour any time by clicking here, or by pressing the "T" key.'
            },
            {
                selector: '[data-tour="btn-screenshot"]',
                title: 'Screenshot',
                text: 'Captures the current page content as a PNG image and downloads it instantly. If you are signed in, your name and the date are stamped onto the image.'
            },
            {
                selector: '[data-tour="btn-pdf"]',
                title: 'Full PDF Guide',
                text: 'Generates and downloads a complete multi-page PDF explaining distributed object storage from the absolute basics up to advanced topics like Raft, Merkle trees, and CAP theorem — great for revision.'
            },
            {
                selector: '[data-tour="btn-theme"]',
                title: 'Light / Dark Mode',
                text: 'Switch between dark and light themes. Your choice is remembered for next time. You can also press "D" to toggle instantly.'
            },
            {
                selector: '[data-tour="btn-shortcuts"]',
                title: 'Keyboard Shortcuts',
                text: 'Opens a cheat-sheet of every keyboard shortcut available on the site. You can also just press "?" at any time.'
            },
            {
                selector: '#account-widget',
                title: 'Account System',
                text: 'Sign in with just your name (stored only in your browser). Once signed in, your name appears in the header and is stamped onto screenshots and the PDF guide. Use the logout icon to sign out any time.'
            },
            {
                selector: '[data-tour="tab-topology"]',
                tab: 'topology',
                title: 'Cluster Topology & Ring',
                text: 'See all 6 storage nodes across 3 availability zones, plus the consistent hash ring that maps data to nodes. Click a node\'s power button to simulate a crash and watch the ring re-route instantly.'
            },
            {
                selector: '[data-tour="tab-objects"]',
                tab: 'objects',
                title: 'Objects & Shards',
                text: 'Every uploaded object is split into checksummed chunks and replicated across 3 nodes (N=3 quorum). Explore stored objects, inspect chunk placement, and manually inject bit-rot into any chunk here.'
            },
            {
                selector: '[data-tour="tab-chaos"]',
                tab: 'chaos',
                title: 'Chaos Engineering',
                text: 'Deliberately break things! Kill the Raft leader, partition a zone, or inject silent bit-rot — then watch Vault detect and recover automatically. One-click auto-heal restores everything.'
            },
            {
                selector: '[data-tour="tab-consensus"]',
                tab: 'consensus',
                title: 'Consensus & Anti-Entropy',
                text: 'Follow the Raft consensus log, current term, and leader election in real time on the left. On the right, trigger a Merkle-tree sync to catch and repair silent data corruption.'
            },
            {
                selector: '[data-tour="tab-explained"]',
                tab: 'explained',
                title: 'Vault Explained (Class 10 level)',
                text: 'New to distributed systems? This tab breaks down sharding, replication, consistent hashing, and bit-rot detection using simple, plain-language analogies.'
            },
            {
                selector: '[data-tour="tab-telemetry"]',
                tab: 'telemetry',
                title: 'Telemetry & IOPS',
                text: 'Live cluster throughput, read/write latency percentiles, storage overhead, and availability SLA — the numbers update automatically every few seconds.'
            },
            {
                selector: '[data-tour="tab-tips"]',
                tab: 'tips',
                title: 'Tips & Best Practices',
                text: 'A curated set of tips for exploring this site, plus real-world distributed-systems best practices that inspired the simulation.'
            },
            {
                selector: '[data-tour="tab-about"]',
                tab: 'about',
                title: 'About & Team',
                text: 'Learn what Vault is for and meet the developers who built it, with photos and links to their LinkedIn and GitHub profiles.'
            }
        ];

        this.currentIndex = 0;
        this.active = false;

        this.root = document.getElementById('tour-root');
        this.backdrop = null;
        this.spotlight = null;
        this.tooltip = null;

        window.addEventListener('resize', () => {
            if (this.active) this.positionStep(this.currentIndex, true);
        });

        document.addEventListener('keydown', (e) => {
            if (!this.active) return;
            if (e.key === 'Escape') this.end();
            if (e.key === 'ArrowRight') this.next();
            if (e.key === 'ArrowLeft') this.prev();
        });
    }

    start() {
        this.currentIndex = 0;
        this.active = true;
        this.buildDom();
        this.positionStep(0);
    }

    buildDom() {
        this.root.innerHTML = `
            <div class="tour-backdrop" id="tour-backdrop"></div>
            <div class="tour-spotlight" id="tour-spotlight"></div>
            <div class="tour-tooltip" id="tour-tooltip">
                <h4 id="tour-title"><i class="fa-solid fa-compass"></i> <span></span><span class="tour-step-count" id="tour-step-count"></span></h4>
                <p id="tour-text"></p>
                <div class="tour-tooltip-footer">
                    <div class="tour-dots" id="tour-dots"></div>
                    <div class="tour-btn-group">
                        <span class="tour-skip" onclick="guidedTour.end()">Skip</span>
                        <button class="tour-nav-btn" id="tour-prev-btn" onclick="guidedTour.prev()">Back</button>
                        <button class="tour-nav-btn primary" id="tour-next-btn" onclick="guidedTour.next()">Next</button>
                    </div>
                </div>
            </div>
        `;
        this.backdrop = document.getElementById('tour-backdrop');
        this.spotlight = document.getElementById('tour-spotlight');
        this.tooltip = document.getElementById('tour-tooltip');

        this.backdrop.addEventListener('click', () => this.end());

        const dotsContainer = document.getElementById('tour-dots');
        dotsContainer.innerHTML = this.steps.map((_, i) => `<span class="tour-dot" data-idx="${i}"></span>`).join('');
    }

    positionStep(index, skipTabSwitch) {
        const step = this.steps[index];
        if (!step) return;

        if (step.tab && !skipTabSwitch) {
            switchTab(step.tab);
        }

        setTimeout(() => {
            const target = document.querySelector(step.selector);

            if (target) {
                // block:'center' avoids long forced page scrolls (e.g. About tab);
                // inline:'nearest' guarantees we never force horizontal scrolling.
                target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }

            // give the smooth-scroll a moment to settle before measuring position
            setTimeout(() => {
                const rect = target ? target.getBoundingClientRect() : { top: window.innerHeight / 2 - 40, left: window.innerWidth / 2 - 80, width: 160, height: 80 };
                const pad = 8;

                const spotTop = Math.max(4, rect.top - pad);
                const spotLeft = Math.max(4, rect.left - pad);
                const spotWidth = Math.min(rect.width + pad * 2, window.innerWidth - spotLeft - 4);

                this.spotlight.style.top = spotTop + 'px';
                this.spotlight.style.left = spotLeft + 'px';
                this.spotlight.style.width = spotWidth + 'px';
                this.spotlight.style.height = (rect.height + pad * 2) + 'px';

                const tooltipWidth = Math.min(300, window.innerWidth - 32);
                let top = rect.bottom + 18;
                let left = Math.min(Math.max(rect.left, 16), window.innerWidth - tooltipWidth - 16);
                const tooltipHeight = 190;

                if (top + tooltipHeight > window.innerHeight) {
                    top = Math.max(rect.top - tooltipHeight - 18, 16);
                }
                top = Math.min(top, window.innerHeight - tooltipHeight - 8);

                this.tooltip.style.top = top + 'px';
                this.tooltip.style.left = left + 'px';

                document.getElementById('tour-title').querySelector('span').textContent = step.title;
                document.getElementById('tour-text').textContent = step.text;
                document.getElementById('tour-step-count').textContent = `${index + 1}/${this.steps.length}`;

                document.querySelectorAll('.tour-dot').forEach((d, i) => d.classList.toggle('active', i === index));

                document.getElementById('tour-prev-btn').style.visibility = index === 0 ? 'hidden' : 'visible';
                document.getElementById('tour-next-btn').textContent = index === this.steps.length - 1 ? 'Finish' : 'Next';
            }, target ? 260 : 0);
        }, step.tab && !skipTabSwitch ? 260 : 0);
    }

    next() {
        if (this.currentIndex === this.steps.length - 1) {
            this.end();
            return;
        }
        this.currentIndex++;
        this.positionStep(this.currentIndex);
    }

    prev() {
        if (this.currentIndex === 0) return;
        this.currentIndex--;
        this.positionStep(this.currentIndex);
    }

    end() {
        this.active = false;
        localStorage.setItem('vault_tour_seen', '1');
        if (this.root) this.root.innerHTML = '';
    }
}

let guidedTour;

/* ---------------------------------------------------------
   10. Theme (light / dark) system
   --------------------------------------------------------- */
const vaultTheme = {
    apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.toggle('dark', theme === 'dark');
        const icon = document.getElementById('theme-toggle-icon');
        const label = document.getElementById('theme-toggle-label');
        if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-moon text-cyan-300' : 'fa-solid fa-sun text-amber-500';
        if (label) label.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
        localStorage.setItem('vault_theme', theme);
    },
    toggle() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        this.apply(current === 'dark' ? 'light' : 'dark');
    },
    init() {
        const saved = localStorage.getItem('vault_theme') ||
            (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
        this.apply(saved);
    }
};

/* ---------------------------------------------------------
   11. Account system
   --------------------------------------------------------- */
function openLoginModal() {
    document.getElementById('login-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('login-name-input').focus(), 100);
}
function closeLoginModal() {
    document.getElementById('login-modal').classList.add('hidden');
}
function submitLogin() {
    const input = document.getElementById('login-name-input');
    const name = (input.value || '').trim();
    if (!name) { input.focus(); return; }
    localStorage.setItem('vault_user_name', name);
    renderAccountWidget();
    closeLoginModal();
    vaultEngine.logEvent('SUCCESS', 'ACCOUNT', `Signed in as ${name}.`);
}
function logoutUser() {
    localStorage.removeItem('vault_user_name');
    renderAccountWidget();
    vaultEngine.logEvent('INFO', 'ACCOUNT', 'Signed out.');
}
function getCurrentUserName() {
    return localStorage.getItem('vault_user_name') || null;
}
function renderAccountWidget() {
    const name = getCurrentUserName();
    const loginBtn = document.getElementById('account-login-btn');
    const chip = document.getElementById('account-chip');
    if (name) {
        loginBtn.classList.add('hidden');
        chip.classList.remove('hidden');
        chip.classList.add('flex');
        document.getElementById('account-name-label').textContent = name;
        document.getElementById('account-avatar-initial').textContent = name.trim()[0].toUpperCase();
    } else {
        loginBtn.classList.remove('hidden');
        chip.classList.add('hidden');
        chip.classList.remove('flex');
    }
}

/* ---------------------------------------------------------
   12. Global search
   --------------------------------------------------------- */
const vaultSearch = {
    buildIndex() {
        const items = [];
        vaultEngine.nodes.forEach(n => items.push({
            type: 'Node', title: n.id, meta: `${n.az} · ${n.status} · ${n.cpu}% CPU`,
            tab: 'topology', targetId: `node-card-${n.id}`
        }));
        vaultEngine.objects.forEach(o => {
            items.push({
                type: 'Object', title: o.name, meta: `${o.size} MB · ${o.chunks.length} chunks`,
                tab: 'objects', targetId: `object-card-${o.name.replace(/[^a-zA-Z0-9]/g, '-')}`
            });
            o.chunks.forEach(c => items.push({
                type: 'Chunk', title: c.id, meta: `in ${o.name} · primary ${c.primaryNode}`,
                tab: 'objects', targetId: `object-card-${o.name.replace(/[^a-zA-Z0-9]/g, '-')}`
            }));
        });
        TIPS_CONTENT.forEach((t, i) => items.push({
            type: 'Tip', title: t.title, meta: t.body.slice(0, 60) + '…',
            tab: 'tips', targetId: null
        }));
        ['Cluster Topology & Ring', 'Objects & Shards', 'Chaos Engineering', 'Consensus & Anti-Entropy',
         'Vault Explained', 'Telemetry & IOPS', 'Tips & Best Practices', 'About & Team'].forEach((title, i) => {
            items.push({ type: 'Section', title, meta: 'Jump to this tab', tab: TAB_IDS[i], targetId: null });
        });
        return items;
    },
    onInput(query) {
        const box = document.getElementById('search-results');
        const q = query.trim().toLowerCase();
        if (!q) { box.classList.add('hidden'); box.innerHTML = ''; return; }

        const index = this.buildIndex();
        const matches = index.filter(item =>
            item.title.toLowerCase().includes(q) || item.meta.toLowerCase().includes(q)
        ).slice(0, 8);

        if (matches.length === 0) {
            box.innerHTML = `<div class="search-result-empty">No results for "${query}"</div>`;
        } else {
            box.innerHTML = matches.map((m, i) => `
                <div class="search-result-item" onclick="vaultSearch.select(${i})">
                    <span class="sr-title">${m.title} <span class="text-[9px] text-gray-500">(${m.type})</span></span>
                    <span class="sr-meta">${m.meta}</span>
                </div>
            `).join('');
            this._lastMatches = matches;
        }
        box.classList.remove('hidden');
    },
    select(i) {
        const m = this._lastMatches[i];
        if (!m) return;
        switchTab(m.tab);
        document.getElementById('search-results').classList.add('hidden');
        document.getElementById('global-search-input').value = '';
        if (m.targetId) {
            setTimeout(() => {
                const el = document.getElementById(m.targetId);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                    el.classList.add('search-highlight');
                    setTimeout(() => el.classList.remove('search-highlight'), 1700);
                }
            }, 260);
        }
    }
};

document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.search-wrap');
    if (wrap && !wrap.contains(e.target)) {
        document.getElementById('search-results').classList.add('hidden');
    }
});

/* ---------------------------------------------------------
   13. Tools: screenshot + PDF guide generator
   --------------------------------------------------------- */
const vaultTools = {
    takeScreenshot() {
        if (typeof html2canvas === 'undefined') {
            vaultEngine.logEvent('ERROR', 'SCREENSHOT', 'html2canvas failed to load — check your network connection.');
            return;
        }
        vaultEngine.logEvent('INFO', 'SCREENSHOT', 'Capturing current view…');
        const target = document.getElementById('capture-root') || document.body;
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--v-bg').trim() || '#0b0f19';

        html2canvas(target, { backgroundColor: bg, useCORS: true, scale: 2 }).then(canvas => {
            const user = getCurrentUserName();
            const ctx = canvas.getContext('2d');
            ctx.font = '24px monospace';
            ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
            ctx.textAlign = 'right';
            const stamp = `VAULT${user ? ' · ' + user : ''} · ${new Date().toLocaleString()}`;
            ctx.fillText(stamp, canvas.width - 24, canvas.height - 20);

            const link = document.createElement('a');
            link.download = `vault-screenshot-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            vaultEngine.logEvent('SUCCESS', 'SCREENSHOT', 'Screenshot downloaded.');
        }).catch(err => {
            console.error(err);
            vaultEngine.logEvent('ERROR', 'SCREENSHOT', 'Screenshot capture failed.');
        });
    },

    generatePdfGuide() {
        if (typeof window.jspdf === 'undefined') {
            vaultEngine.logEvent('ERROR', 'PDF', 'jsPDF failed to load — check your network connection.');
            return;
        }
        vaultEngine.logEvent('INFO', 'PDF', 'Generating full concept guide PDF…');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 48;
        const maxW = pageW - margin * 2;
        let y = margin;
        const user = getCurrentUserName();

        function addPageIfNeeded(lineHeight) {
            if (y + lineHeight > pageH - margin) {
                doc.addPage();
                y = margin;
            }
        }
        function heading(text, size) {
            addPageIfNeeded(size + 14);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(size);
            doc.setTextColor(6, 130, 155);
            doc.text(text, margin, y);
            y += size + 10;
            doc.setTextColor(20, 20, 20);
        }
        function paragraph(text) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10.5);
            const lines = doc.splitTextToSize(text, maxW);
            lines.forEach(line => {
                addPageIfNeeded(15);
                doc.text(line, margin, y);
                y += 15;
            });
            y += 6;
        }
        function bullet(text) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10.5);
            const lines = doc.splitTextToSize('•  ' + text, maxW - 10);
            lines.forEach((line, i) => {
                addPageIfNeeded(15);
                doc.text(line, margin + (i === 0 ? 0 : 12), y);
                y += 15;
            });
        }

        // Cover
        doc.setFillColor(11, 15, 25);
        doc.rect(0, 0, pageW, pageH, 'F');
        doc.setTextColor(6, 182, 212);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(34);
        doc.text('VAULT', margin, 160);
        doc.setFontSize(14);
        doc.setTextColor(200, 210, 225);
        doc.text('Fault-Tolerant Distributed Object Storage', margin, 190);
        doc.text('From First Principles to Advanced Concepts', margin, 210);
        doc.setFontSize(10);
        doc.setTextColor(150, 160, 180);
        doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 250);
        if (user) doc.text(`Prepared for: ${user}`, margin, 268);
        doc.addPage();
        y = margin;

        heading('1. What Is Distributed Object Storage?', 16);
        paragraph('Distributed object storage spreads data across many independent machines (nodes) instead of keeping it on a single server. Each file is treated as an "object" with data plus metadata, and objects are broken into smaller pieces so the system can store, move, and heal data efficiently at massive scale.');
        paragraph('This differs from traditional file storage (a single filesystem on one disk) and block storage (raw disks attached to one machine). Distributed object storage is built to survive individual machine failures without losing data or going offline.');

        heading('2. Why Not Just Use One Big Server?', 16);
        bullet('A single server is a single point of failure — if its disk dies, the data is gone.');
        bullet('One machine has limited throughput; many machines serving data in parallel scale much further.');
        bullet('Growth needs elastic capacity — add more nodes instead of buying bigger hardware.');
        bullet('Geographic spread (multiple data centers) protects against site-wide outages.');
        y += 4;

        heading('3. Sharding: Breaking Objects into Chunks', 16);
        paragraph('Large objects are split into fixed-size chunks (Vault uses 64MB chunks). Splitting has two benefits: many nodes can transfer chunks of the same object in parallel, and only the affected chunk needs to be repaired if part of an object is damaged — not the whole file.');
        paragraph('Each chunk gets a cryptographic checksum (SHA-256) calculated from its contents. Any later change to the bytes — even a single flipped bit — produces a completely different checksum, which is how corruption is detected.');

        heading('4. Replication and Quorum (N=3)', 16);
        paragraph('Every chunk is stored on multiple nodes, not just one. Vault uses a replication factor of N=3: three independent copies, ideally spread across three different availability zones (AZs) so that a single power outage or network failure cannot take out every copy at once.');
        paragraph('A "quorum" is the minimum number of replicas that must agree for an operation to be considered successful. With N=3, the system can typically tolerate the loss of any one replica and keep serving reads and writes correctly.');
        bullet('Read quorum + write quorum > N guarantees readers always see the latest committed write.');
        bullet('Higher N means better durability but more storage cost and network overhead.');

        heading('5. Consistent Hashing: Where Does Data Live?', 16);
        paragraph('A naive approach maps each object to a node with "hash(key) % number_of_nodes". The problem: whenever a node is added or removed, almost every key remaps to a different node, causing massive, unnecessary data movement.');
        paragraph('Consistent hashing solves this by placing both nodes and data keys on a conceptual ring spanning a fixed range (Vault uses 0-360 degrees). A key belongs to the first node found walking clockwise from its position. Adding or removing a node only reshuffles the keys near that one node\'s position on the ring — a small, local disruption instead of a global one.');
        paragraph('Virtual nodes (multiple ring positions per physical node) smooth out load distribution so that no single node is overloaded just because of where it happened to land on the ring.');

        addPageIfNeeded(20);
        heading('6. Bit-Rot and Silent Data Corruption', 16);
        paragraph('"Bit-rot" refers to data silently degrading over time on physical media — magnetic domains weakening, SSD cells losing charge, or cosmic-ray induced bit flips. The danger is that the operating system does not flag this: a corrupted file simply opens with wrong bytes.');
        paragraph('Distributed storage systems defend against this by periodically re-computing checksums for stored chunks and comparing them against the checksum recorded at write time. A mismatch means corruption — the chunk is then rebuilt from a healthy replica automatically.');

        heading('7. Merkle Trees for Efficient Verification', 16);
        paragraph('Comparing every single chunk between every pair of replica nodes would be extremely expensive at scale. Merkle trees solve this with hierarchical hashing: each leaf is the hash of one chunk, and each parent node is the hash of its children\'s hashes combined, all the way up to a single "root hash".');
        paragraph('Two replicas with an identical root hash are guaranteed to hold identical data — no chunk comparison needed. If the root hashes differ, the nodes only need to walk down the branches that disagree, comparing children until the exact mismatched leaves are found. This makes verification run in O(log N) time instead of O(N).');

        heading('8. Consensus: Getting Nodes to Agree (Raft)', 16);
        paragraph('When multiple nodes can accept writes, they need a way to agree on the order of operations and on which node is currently in charge — otherwise conflicting updates could corrupt the system\'s state. Raft is a consensus algorithm designed to be understandable while providing the same guarantees as protocols like Paxos.');
        bullet('Nodes are Leaders, Followers, or Candidates. Only one Leader exists per "term".');
        bullet('The Leader receives writes, appends them to a replicated log, and replicates that log to Followers.');
        bullet('A write is "committed" once a majority (quorum) of nodes have durably stored it.');
        bullet('If the Leader stops responding, Followers time out and hold an election to pick a new Leader for the next term.');
        paragraph('This is exactly what Vault\'s "Consensus & Anti-Entropy" tab visualizes: the current term, the elected leader, the commit index, and the replicated log entries.');

        heading('9. The CAP Theorem', 16);
        paragraph('The CAP theorem states that a distributed system can only fully guarantee two of three properties at the same time during a network partition: Consistency (every read sees the latest write), Availability (every request gets a response), and Partition tolerance (the system keeps working despite network splits).');
        paragraph('Because networks can and do partition in the real world, practical systems choose how to trade off Consistency versus Availability when a partition happens. Vault leans toward strong consistency for committed writes (via Raft) while still aiming for high availability through replication.');

        addPageIfNeeded(20);
        heading('10. Chaos Engineering', 16);
        paragraph('Chaos engineering is the discipline of deliberately injecting failures — killing processes, cutting network links, corrupting data — into a system to verify it behaves correctly under real-world failure conditions, rather than hoping it will.');
        paragraph('Vault\'s Chaos tab lets you kill the Raft leader (forcing an election), partition an availability zone (isolating nodes from the rest of the cluster), inject bit-rot (silent corruption), or cascade multiple failures at once — then trigger auto-heal to watch recovery happen live.');

        heading('11. Advanced Topics for Further Study', 16);
        bullet('Erasure coding — storing parity fragments instead of full replicas for better storage efficiency than N=3 replication.');
        bullet('Vector clocks and eventual consistency — alternatives to strict consensus for higher availability.');
        bullet('Gossip protocols — how nodes discover cluster membership and health without a central coordinator.');
        bullet('Rebalancing and hinted handoff — how systems redistribute data when nodes join, leave, or recover.');
        bullet('Real-world systems that use these ideas: Amazon S3, Google Cloud Spanner, Apache Cassandra, Ceph, MinIO, and HDFS.');

        heading('12. Glossary', 16);
        bullet('Node — a single storage server participating in the cluster.');
        bullet('Shard / Chunk — a fixed-size piece of a larger object.');
        bullet('Replica — a copy of a chunk stored on a different node.');
        bullet('Quorum — the minimum number of nodes that must agree for an operation to succeed.');
        bullet('Checksum — a fingerprint (e.g. SHA-256) used to detect data corruption.');
        bullet('Leader / Follower — roles nodes take on in a consensus protocol like Raft.');
        bullet('Availability Zone (AZ) — an isolated location (power, network, cooling) used to avoid correlated failures.');

        y += 10;
        addPageIfNeeded(40);
        doc.setDrawColor(6, 182, 212);
        doc.line(margin, y, pageW - margin, y);
        y += 20;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9.5);
        doc.setTextColor(100, 100, 100);
        doc.text('Generated automatically by the Vault simulation website. Built by Aryan Das, Pranay Kathpaul and Chandan Singh.', margin, y);

        doc.save(`vault-full-guide-${Date.now()}.pdf`);
        vaultEngine.logEvent('SUCCESS', 'PDF', 'Full concept guide PDF downloaded.');
    }
};

/* ---------------------------------------------------------
   14. Keyboard shortcuts
   --------------------------------------------------------- */
const SHORTCUTS = [
    { keys: '/', desc: 'Focus the global search bar' },
    { keys: '1 – 9', desc: 'Jump directly to tab 1 through 9' },
    { keys: 'U', desc: 'Open the Upload Object modal' },
    { keys: 'T', desc: 'Start the full guided tour' },
    { keys: 'S', desc: 'Take a screenshot' },
    { keys: 'G', desc: 'Download the full PDF guide' },
    { keys: 'D', desc: 'Toggle light / dark mode' },
    { keys: 'Esc', desc: 'Close any open modal or the tour' },
    { keys: '?', desc: 'Open this shortcuts panel' }
];

function openShortcutsModal() {
    const list = document.getElementById('shortcuts-list');
    list.innerHTML = SHORTCUTS.map(s => `
        <div class="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/60 border border-gray-800">
            <span class="text-gray-300">${s.desc}</span>
            <kbd class="kbd-chip">${s.keys}</kbd>
        </div>
    `).join('');
    document.getElementById('shortcuts-modal').classList.remove('hidden');
}
function closeShortcutsModal() {
    document.getElementById('shortcuts-modal').classList.add('hidden');
}

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        const isTyping = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

        if (e.key === 'Escape') {
            closeUploadModal(); closeLoginModal(); closeShortcutsModal();
            document.getElementById('search-results').classList.add('hidden');
            if (guidedTour && guidedTour.active) guidedTour.end();
            return;
        }

        if (isTyping) return;

        if (e.key === '/') {
            e.preventDefault();
            document.getElementById('global-search-input').focus();
        } else if (e.key === '?') {
            openShortcutsModal();
        } else if (e.key >= '1' && e.key <= '8') {
            const idx = parseInt(e.key) - 1;
            if (TAB_IDS[idx]) switchTab(TAB_IDS[idx]);
        } else if (e.key.toLowerCase() === 'u') {
            triggerUploadModal();
        } else if (e.key.toLowerCase() === 't') {
            guidedTour.start();
        } else if (e.key.toLowerCase() === 's') {
            vaultTools.takeScreenshot();
        } else if (e.key.toLowerCase() === 'g') {
            vaultTools.generatePdfGuide();
        } else if (e.key.toLowerCase() === 'd') {
            vaultTheme.toggle();
        }
    });
}

/* ---------------------------------------------------------
   14b. Storage, Quorum & Erasure-Coding Calculator
   --------------------------------------------------------- */
function formatStorageGB(gb) {
    if (!isFinite(gb) || gb < 0) return '—';
    if (gb >= 1024) return (gb / 1024).toFixed(2) + ' TB';
    return (Math.round(gb * 100) / 100).toLocaleString() + ' GB';
}

const vaultCalc = {
    update() {
        const dataSizeEl = document.getElementById('calc-data-size');
        if (!dataSizeEl) return; // calculator tab not in DOM (defensive)

        const dataSize = Math.max(parseFloat(dataSizeEl.value) || 0, 0);
        const nodeCount = Math.max(parseInt(document.getElementById('calc-node-count').value) || 1, 1);
        const N = Math.max(parseInt(document.getElementById('calc-n').value) || 1, 1);
        const R = Math.max(parseInt(document.getElementById('calc-r').value) || 1, 1);
        const W = Math.max(parseInt(document.getElementById('calc-w').value) || 1, 1);
        const k = Math.max(parseInt(document.getElementById('calc-ec-k').value) || 1, 1);
        const m = Math.max(parseInt(document.getElementById('calc-ec-m').value) || 0, 0);

        // --- Replication model ---
        const rawStorage = dataSize * N;
        const perNode = rawStorage / nodeCount;
        const maxFail = Math.max(N - 1, 0);
        const replOverheadPct = (N - 1) * 100;
        const strongConsistency = (R + W) > N;

        document.getElementById('calc-out-raw-storage').innerText = formatStorageGB(rawStorage);
        document.getElementById('calc-out-per-node').innerText = formatStorageGB(perNode);
        document.getElementById('calc-out-max-fail').innerText = `${maxFail} node${maxFail === 1 ? '' : 's'}`;

        const consistencyEl = document.getElementById('calc-out-consistency');
        consistencyEl.innerText = `${strongConsistency ? 'STRONG' : 'EVENTUAL'} (${R + W} ${strongConsistency ? '>' : '≤'} ${N})`;
        consistencyEl.className = `calc-status-pill ${strongConsistency ? 'calc-status-ok' : 'calc-status-warn'}`;

        document.getElementById('calc-out-repl-pct').innerText = `${replOverheadPct.toFixed(0)}%`;
        document.getElementById('calc-bar-repl').style.width = `${Math.min(replOverheadPct / 300 * 100, 100)}%`;

        // --- Erasure coding model ---
        const ecTotal = k + m;
        const ecStorage = dataSize * ecTotal / k;
        const ecOverheadPct = (m / k) * 100;

        document.getElementById('calc-out-ec-storage').innerText = formatStorageGB(ecStorage);
        document.getElementById('calc-out-ec-fault').innerText = `${m} shard${m === 1 ? '' : 's'}`;
        document.getElementById('calc-out-ec-pct').innerText = `${ecOverheadPct.toFixed(0)}%`;
        document.getElementById('calc-bar-ec').style.width = `${Math.min(ecOverheadPct / 300 * 100, 100)}%`;

        // --- Plain-language summary ---
        const savingPct = replOverheadPct > 0 ? (1 - (ecOverheadPct / replOverheadPct)) * 100 : 0;
        let summary;
        if (ecOverheadPct < replOverheadPct) {
            summary = `With these numbers, erasure coding (k=${k}, m=${m}) needs roughly ${Math.max(savingPct, 0).toFixed(0)}% less raw storage than N=${N} replication, while still surviving the loss of any ${m} shard${m === 1 ? '' : 's'}. The trade-off: rebuilding a lost shard costs CPU time, whereas a replicated copy is ready to serve instantly.`;
        } else if (ecOverheadPct > replOverheadPct) {
            summary = `With these numbers, N=${N} replication is actually cheaper on storage than erasure coding (k=${k}, m=${m}) — that happens when the parity ratio m/k is high. Replication also reads faster since no reconstruction is needed.`;
        } else {
            summary = `At these settings, both models use roughly the same raw storage. The deciding factor becomes recovery speed (replication is instant) versus disk efficiency at larger scale (erasure coding wins as k grows).`;
        }
        document.getElementById('calc-out-summary').innerText = summary;
    }
};

/* ---------------------------------------------------------
   15. Tips & best practices content
   --------------------------------------------------------- */
const TIPS_CONTENT = [
    { icon: 'fa-hand-pointer text-cyan-400', title: 'Break things on purpose', body: 'Head to the Chaos tab and kill the Raft leader — watch the Consensus tab to see a new leader get elected within seconds.' },
    { icon: 'fa-magnifying-glass text-emerald-400', title: 'Use global search', body: 'Press "/" and search for any node, object, or chunk ID to jump straight to it, anywhere in the app.' },
    { icon: 'fa-camera text-purple-400', title: 'Document your experiments', body: 'Take a screenshot after each chaos scenario to build a visual timeline of how the cluster recovers.' },
    { icon: 'fa-keyboard text-amber-400', title: 'Go keyboard-only', body: 'Every major action has a shortcut — press "?" any time to see the full cheat-sheet.' },
    { icon: 'fa-circle-half-stroke text-rose-400', title: 'Match your environment', body: 'Switch to light mode for presentations in a bright room, or keep dark mode for late-night deep dives.' },
    { icon: 'fa-file-pdf text-cyan-400', title: 'Study offline', body: 'Download the full PDF guide to read the underlying distributed-systems theory without needing a browser.' },
    { icon: 'fa-network-wired text-emerald-400', title: 'Replication factor trade-off', body: 'Real systems raise N (replica count) for durability but pay extra storage and network cost — there is no free lunch.' },
    { icon: 'fa-tree text-purple-400', title: 'Merkle trees save bandwidth', body: 'Two nodes with matching root hashes are provably identical — no need to transfer or compare every chunk.' },
    { icon: 'fa-shield-halved text-amber-400', title: 'Quorum beats "just one copy"', body: 'A write acknowledged by a majority of replicas survives the loss of any single node — that is the core safety trick.' },
    { icon: 'fa-skull-crossbones text-rose-400', title: 'Chaos engineering is proactive', body: 'Teams that intentionally break staging systems find weaknesses before real outages do — try the "cascading failure" preset.' }
];

function renderTipsGrid() {
    const grid = document.getElementById('tips-grid');
    if (!grid) return;
    grid.innerHTML = TIPS_CONTENT.map(t => `
        <div class="tip-card hover-lift">
            <i class="fa-solid ${t.icon}"></i>
            <div>
                <div class="font-bold font-mono text-xs text-gray-200 mb-1">${t.title}</div>
                <div class="text-xs text-gray-400 leading-relaxed">${t.body}</div>
            </div>
        </div>
    `).join('');
}

/* ---------------------------------------------------------
   16. Ripple button feedback
   --------------------------------------------------------- */
function initRippleButtons() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.ripple-btn');
        if (!btn) return;

        const rect = btn.getBoundingClientRect();
        const span = document.createElement('span');
        const size = Math.max(rect.width, rect.height);
        span.className = 'ripple-span';
        span.style.width = span.style.height = size + 'px';
        span.style.left = (e.clientX - rect.left - size / 2) + 'px';
        span.style.top = (e.clientY - rect.top - size / 2) + 'px';

        const prevPosition = getComputedStyle(btn).position;
        if (prevPosition === 'static') btn.style.position = 'relative';

        btn.appendChild(span);
        setTimeout(() => span.remove(), 650);
    });
}

/* ---------------------------------------------------------
   Bootstrap
   ---------------------------------------------------------
   IMPORTANT: this script tag sits at the very end of <body>,
   so the DOM is already fully parsed by the time this file
   runs. We deliberately do NOT wait for `window.load` here —
   that event only fires once every external resource (Google
   Fonts, Font Awesome, the Tailwind CDN script) has finished
   loading, and a single slow/blocked resource on a flaky
   network would leave the whole app — including the boot
   screen — stuck forever. Running immediately, plus a hard
   safety-net timeout inside BootSequence, guarantees the site
   always comes up.
   --------------------------------------------------------- */
function initVaultApp() {
    let boot;
    try {
        boot = new BootSequence();
    } catch (e) {
        console.warn('Vault: boot screen unavailable —', e);
    }

    try {
        vaultTheme.init();
    } catch (e) {
        console.warn('Vault: theme init failed —', e);
    }

    try {
        vaultEngine = new VaultClusterEngine();
        guidedTour = new GuidedTour();

        vaultEngine.updateAllViews();
        vaultEngine.logEvent('SUCCESS', 'SYSTEM', 'Vault Enterprise Cluster Engine initialized. 6 Nodes online across 3 Availability Zones.');
    } catch (e) {
        console.error('Vault: core engine failed to initialize —', e);
    }

    try {
        renderAccountWidget();
    } catch (e) {
        console.warn('Vault: account widget init failed —', e);
    }

    try {
        renderTipsGrid();
    } catch (e) {
        console.warn('Vault: tips grid init failed —', e);
    }

    try {
        vaultCalc.update();
    } catch (e) {
        console.warn('Vault: calculator init failed —', e);
    }

    try {
        initKeyboardShortcuts();
    } catch (e) {
        console.warn('Vault: keyboard shortcuts disabled —', e);
    }

    try {
        new ParticleField('particle-canvas');
    } catch (e) {
        console.warn('Vault: particle background disabled —', e);
    }

    try {
        initRippleButtons();
    } catch (e) {
        console.warn('Vault: ripple button effect disabled —', e);
    }

    if (boot) {
        boot.run();
    } else {
        const fallbackScreen = document.getElementById('boot-screen');
        if (fallbackScreen) fallbackScreen.style.display = 'none';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVaultApp);
} else {
    initVaultApp();
}
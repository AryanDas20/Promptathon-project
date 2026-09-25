 // Utility Functions
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
            for(let i = 0; i < 12; i++) {
                res += hex[Math.floor(Math.abs(Math.sin(seed + i)) * 16)];
            }
            return res;
        }

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
                        <div class="glass-card rounded-xl p-4 border border-gray-800 flex flex-col justify-between space-y-3 relative overflow-hidden transition-all ${isDead ? 'opacity-50' : ''}">
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
                                <button onclick="vaultEngine.toggleNodeStatus('${n.id}')" class="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[11px] text-gray-300 transition-all">
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
                    <div class="glass-card rounded-xl p-4 border border-gray-800 space-y-3">
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

        window.onload = function() {
            vaultEngine = new VaultClusterEngine();
            vaultEngine.updateAllViews();
            vaultEngine.logEvent('SUCCESS', 'SYSTEM', 'Vault Enterprise Cluster Engine initialized. 6 Nodes online across 3 Availability Zones.');
        };

        function switchTab(tabId) {
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('active', 'border-cyan-400', 'text-cyan-400', 'bg-gray-900/60');
                b.classList.add('border-transparent', 'text-gray-400');
            });
            document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));

            const targetBtn = document.getElementById(`tab-${tabId}`);
            const targetView = document.getElementById(`view-${tabId}`);

            if (targetBtn) {
                targetBtn.classList.add('active', 'border-cyan-400', 'text-cyan-400', 'bg-gray-900/60');
                targetBtn.classList.remove('border-transparent', 'text-gray-400');
            }
            if (targetView) {
                targetView.classList.remove('hidden');
            }

            if (tabId === 'topology') {
                vaultEngine.drawHashRing();
            } else if (tabId === 'telemetry') {
                vaultEngine.renderTelemetryChart();
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
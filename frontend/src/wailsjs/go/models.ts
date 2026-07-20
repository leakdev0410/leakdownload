export namespace main {
	
	export class Settings {
	    downloadDir: string;
	    downKBps: number;
	    upKBps: number;
	    enableApibay: boolean;
	    enableTorrentsCSV: boolean;
	    jackettURL: string;
	    jackettAPIKey: string;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.downloadDir = source["downloadDir"];
	        this.downKBps = source["downKBps"];
	        this.upKBps = source["upKBps"];
	        this.enableApibay = source["enableApibay"];
	        this.enableTorrentsCSV = source["enableTorrentsCSV"];
	        this.jackettURL = source["jackettURL"];
	        this.jackettAPIKey = source["jackettAPIKey"];
	    }
	}

}

export namespace torrentengine {
	
	export class TrackerView {
	    url: string;
	    tier: number;
	
	    static createFrom(source: any = {}) {
	        return new TrackerView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.tier = source["tier"];
	    }
	}
	export class PeerView {
	    addr: string;
	    client: string;
	
	    static createFrom(source: any = {}) {
	        return new PeerView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.addr = source["addr"];
	        this.client = source["client"];
	    }
	}
	export class FileView {
	    index: number;
	    path: string;
	    bytes: number;
	    progress: number;
	    priority: string;
	
	    static createFrom(source: any = {}) {
	        return new FileView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.path = source["path"];
	        this.bytes = source["bytes"];
	        this.progress = source["progress"];
	        this.priority = source["priority"];
	    }
	}
	export class Detail {
	    infoHash: string;
	    files: FileView[];
	    peers: PeerView[];
	    trackers: TrackerView[];
	    pieceLength: number;
	    numPieces: number;
	    comment: string;
	    createdBy: string;
	
	    static createFrom(source: any = {}) {
	        return new Detail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.infoHash = source["infoHash"];
	        this.files = this.convertValues(source["files"], FileView);
	        this.peers = this.convertValues(source["peers"], PeerView);
	        this.trackers = this.convertValues(source["trackers"], TrackerView);
	        this.pieceLength = source["pieceLength"];
	        this.numPieces = source["numPieces"];
	        this.comment = source["comment"];
	        this.createdBy = source["createdBy"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class GlobalStats {
	    downSpeed: number;
	    upSpeed: number;
	    active: number;
	    total: number;
	    downloading: number;
	    seeding: number;
	    completed: number;
	    paused: number;
	    connections: number;
	    dhtNodes: number;
	    downLimit: number;
	    upLimit: number;
	
	    static createFrom(source: any = {}) {
	        return new GlobalStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.downSpeed = source["downSpeed"];
	        this.upSpeed = source["upSpeed"];
	        this.active = source["active"];
	        this.total = source["total"];
	        this.downloading = source["downloading"];
	        this.seeding = source["seeding"];
	        this.completed = source["completed"];
	        this.paused = source["paused"];
	        this.connections = source["connections"];
	        this.dhtNodes = source["dhtNodes"];
	        this.downLimit = source["downLimit"];
	        this.upLimit = source["upLimit"];
	    }
	}
	
	export class TorrentView {
	    infoHash: string;
	    name: string;
	    status: string;
	    progress: number;
	    totalBytes: number;
	    doneBytes: number;
	    downSpeed: number;
	    upSpeed: number;
	    upBytes: number;
	    peers: number;
	    seeds: number;
	    ratio: number;
	    eta: number;
	    fileCount: number;
	
	    static createFrom(source: any = {}) {
	        return new TorrentView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.infoHash = source["infoHash"];
	        this.name = source["name"];
	        this.status = source["status"];
	        this.progress = source["progress"];
	        this.totalBytes = source["totalBytes"];
	        this.doneBytes = source["doneBytes"];
	        this.downSpeed = source["downSpeed"];
	        this.upSpeed = source["upSpeed"];
	        this.upBytes = source["upBytes"];
	        this.peers = source["peers"];
	        this.seeds = source["seeds"];
	        this.ratio = source["ratio"];
	        this.eta = source["eta"];
	        this.fileCount = source["fileCount"];
	    }
	}
	export class Snapshot {
	    torrents: TorrentView[];
	    stats: GlobalStats;
	
	    static createFrom(source: any = {}) {
	        return new Snapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.torrents = this.convertValues(source["torrents"], TorrentView);
	        this.stats = this.convertValues(source["stats"], GlobalStats);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

export namespace torrentsearch {
	
	export class Result {
	    name: string;
	    infoHash: string;
	    magnet: string;
	    size: number;
	    seeders: number;
	    leechers: number;
	    source: string;
	    category?: string;
	    link?: string;
	
	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.infoHash = source["infoHash"];
	        this.magnet = source["magnet"];
	        this.size = source["size"];
	        this.seeders = source["seeders"];
	        this.leechers = source["leechers"];
	        this.source = source["source"];
	        this.category = source["category"];
	        this.link = source["link"];
	    }
	}
	export class Response {
	    results: Result[];
	    errors: string[];
	    queried: string[];
	
	    static createFrom(source: any = {}) {
	        return new Response(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.results = this.convertValues(source["results"], Result);
	        this.errors = source["errors"];
	        this.queried = source["queried"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}


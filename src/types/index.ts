export interface SubgraphConfig {
	name: string;
	url: string;
	wsUrl?: string; // WebSocket URL for subscriptions (optional)
}

export interface Config {
	port: number;
	subgraphs: SubgraphConfig[];
	rabbitmqUrl: string;
	lokiHost: string | undefined;
	logLevel: string;
}

export interface GatewayOptions {
	port: number;
	subgraphs: SubgraphConfig[];
	logger: import("@xmer/consumer-shared").ILogger;
}

export interface GatewayInstance {
	start(): Promise<void>;
	stop(): Promise<void>;
}

/**
 * Resilient Service Health Checker
 * Monitors and reports on the health of configured subgraphs
 *
 * Features:
 * - Checks which services are currently available
 * - Tracks available vs unavailable services
 * - Provides gateway status information
 */

import { logger } from '../utils/logger.js';
import { SUBGRAPH_CONFIG } from '../config/subgraphs.js';

interface ResilientGatewayStatus {
  availableServices: string[];
  unavailableServices: string[];
  totalConfigured: number;
}

/**
 * Service health checker for resilient gateway operation
 */
export class ResilientServiceChecker {
  private unavailableServices: Set<string> = new Set();
  private availableServices: Set<string> = new Set();

  constructor() {
    logger.info(
      `[RESILIENT GATEWAY] Initialized service checker for ${SUBGRAPH_CONFIG.length} service(s)`
    );
  }

  /**
   * Check which services are currently available
   */
  async checkServiceHealth(): Promise<ResilientGatewayStatus> {
    const available: string[] = [];
    const unavailable: string[] = [];

    for (const config of SUBGRAPH_CONFIG) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(
          `${config.url}?query={__schema{types{name}}}`,
          {
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (response.ok) {
          available.push(config.name);
          this.availableServices.add(config.name);
          if (this.unavailableServices.has(config.name)) {
            logger.info(`[RESILIENT GATEWAY] ✓ Service recovered: ${config.name}`);
            this.unavailableServices.delete(config.name);
          }
        } else {
          unavailable.push(config.name);
          this.unavailableServices.add(config.name);
        }
      } catch (err) {
        unavailable.push(config.name);
        this.unavailableServices.add(config.name);
      }
    }

    return {
      availableServices: available,
      unavailableServices: unavailable,
      totalConfigured: SUBGRAPH_CONFIG.length,
    };
  }

  /**
   * Get current gateway status
   */
  getStatus(): ResilientGatewayStatus {
    return {
      availableServices: Array.from(this.availableServices),
      unavailableServices: Array.from(this.unavailableServices),
      totalConfigured: SUBGRAPH_CONFIG.length,
    };
  }
}

// Export singleton instance
export const resilientServiceChecker = new ResilientServiceChecker();

export default resilientServiceChecker;

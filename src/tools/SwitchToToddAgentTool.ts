import { HCS10Client } from '../hcs10/HCS10Client';
import { DemoState } from '../demo-state'; // Assuming DemoState might be needed to clear old state
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * SwitchToToddAgentTool reads agent details for 'Todd' from environment variables
 * and reconfigures the HCS10Client instance to use this agent.
 */
export class SwitchToToddAgentTool extends StructuredTool {
  name = 'switch_to_todd_agent';
  description =
    "Switches the active HCS agent to 'Todd' using credentials stored in environment variables (TODD_ACCOUNT_ID, TODD_PRIVATE_KEY). Clears existing connection state.";
  private client: HCS10Client;
  private demoState: DemoState;

  schema = z.object({}); // No inputs required for this tool

  /**
   * @param client - Instance of HCS10Client to reconfigure.
   * @param demoState - Instance of DemoState to potentially clear.
   */
  constructor({
    client,
    demoState,
  }: {
    client: HCS10Client;
    demoState: DemoState;
  }) {
    super();
    this.client = client;
    this.demoState = demoState;
  }

  /**
   * Reads Todd's credentials from process.env, reconfigures the client,
   * and clears connection state. Returns a status message.
   */
  async _call(_input: z.infer<typeof this.schema>): Promise<string> {
    const toddAccountId = process.env.TODD_ACCOUNT_ID;
    const toddPrivateKey = process.env.TODD_PRIVATE_KEY;
    // Optional: Read topic IDs if needed for reconfiguration or state reset
    // const toddInboundTopicId = process.env.TODD_INBOUND_TOPIC_ID;
    // const toddOutboundTopicId = process.env.TODD_OUTBOUND_TOPIC_ID;

    if (!toddAccountId || !toddPrivateKey) {
      return 'Error: Could not switch to Todd agent. TODD_ACCOUNT_ID or TODD_PRIVATE_KEY not found in environment variables. Has the "register_agent" tool been run successfully for Todd?';
    }

    try {
      // --- Client Reconfiguration ---
      // We need a way to update the client's operator credentials.
      // Assuming HCS10Client has a method like 'reconfigureClient' or 'setOperator'.
      // This might require changes to HCS10Client.ts
      console.warn(
        "SwitchToToddAgentTool: Attempting to reconfigure HCS10Client. This assumes a method like 'setOperator' exists. HCS10Client may need updating."
      );
      // Check if the method exists before calling
      if (typeof (this.client as any).setOperator === 'function') {
        (this.client as any).setOperator(toddAccountId, toddPrivateKey);
        console.log(`HCS10Client operator updated to ${toddAccountId}.`);
      } else {
        console.error(
          "SwitchToToddAgentTool: HCS10Client does not have a 'setOperator' method. Cannot switch agent."
        );
        return "Error: Cannot switch agent. The HCS10Client implementation needs a method to update the operator (e.g., 'setOperator(accountId, privateKey)').";
      }

      // --- Clear Demo State ---
      // Assuming DemoState needs clearing when the agent changes.
      // We need a method like 'clearConnections' in DemoState.
      // If not, this part needs adjustment based on DemoState capabilities.
      if (
        this.demoState &&
        typeof (this.demoState as any).clearConnections === 'function'
      ) {
        (this.demoState as any).clearConnections();
        console.log('Cleared existing connection state.');
      } else {
        console.warn(
          "SwitchToToddAgentTool: DemoState does not have a 'clearConnections' method. Old connection state might persist."
        );
      }

      return `Successfully switched active agent to Todd (Account ID: ${toddAccountId}). Existing connection state may have been cleared.`;
    } catch (error) {
      return `Error: Failed to switch agent to Todd. Reason: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
}

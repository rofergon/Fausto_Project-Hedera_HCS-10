import { StructuredTool, ToolParams } from '@langchain/core/tools';
import { z } from 'zod';
import { IStateManager, ActiveConnection } from '../state/open-convai-state';
import { HCS10Client } from '../hcs10/HCS10Client';
import { HCSMessage } from '../hcs10/HCSMessage';

export interface ListConnectionsToolParams extends ToolParams {
  stateManager: IStateManager;
  hcsClient?: HCS10Client;
}

/**
 * A tool to list currently active HCS-10 connections stored in the state manager.
 * Enhanced to show more details similar to moonscape's implementation.
 */
export class ListConnectionsTool extends StructuredTool {
  name = 'list_connections';
  description =
    'Lists the currently active HCS-10 connections with detailed information. Shows connection status, agent details, and recent activity. Use this to get a comprehensive view of all active connections.';
  schema = z.object({
    includeDetails: z
      .boolean()
      .optional()
      .describe(
        'Whether to include detailed information about each connection'
      ),
    showPending: z
      .boolean()
      .optional()
      .describe('Whether to include pending connection requests'),
  });

  private stateManager: IStateManager;
  private hcsClient?: HCS10Client;

  constructor({ stateManager, hcsClient, ...rest }: ListConnectionsToolParams) {
    super(rest);
    this.stateManager = stateManager;
    this.hcsClient = hcsClient;
  }

  protected async _call(args: z.infer<this['schema']>): Promise<string> {
    const includeDetails = args.includeDetails ?? true;
    const showPending = args.showPending ?? true;

    const initialConnectionsFromState = this.stateManager.listConnections();

    const finalStateConnections = await this.enhanceConnectionInfo(
      initialConnectionsFromState
    );

    if (finalStateConnections.length === 0) {
      return 'There are currently no active connections.';
    }

    // Filter based on the FINAL state connections returned after enhancement
    const activeConnections = finalStateConnections.filter(
      (c) => !c.isPending && !c.needsConfirmation
    );

    const pendingConnections = finalStateConnections.filter((c) => c.isPending);

    const needsConfirmation = finalStateConnections.filter(
      (c) => c.needsConfirmation
    );

    let output = '';

    if (activeConnections.length > 0) {
      output += `🟢 Active Connections (${activeConnections.length}):\n`;
      activeConnections.forEach((conn, index) => {
        output += this.formatConnection(conn, index, includeDetails);
      });
      output += '\n';
    }

    if (showPending && needsConfirmation.length > 0) {
      output += `🟠 Connections Needing Confirmation (${needsConfirmation.length}):\n`;
      needsConfirmation.forEach((conn, index) => {
        output += this.formatConnection(conn, index, includeDetails);
      });
      output += '\n';
    }

    if (showPending && pendingConnections.length > 0) {
      output += `⚪ Pending Connection Requests (${pendingConnections.length}):\n`;
      pendingConnections.forEach((conn, index) => {
        output += this.formatConnection(conn, index, includeDetails);
      });
    }

    return output.trim();
  }

  private formatConnection(
    conn: ActiveConnection,
    index: number,
    includeDetails: boolean
  ): string {
    let output = `${index + 1}. ${
      conn.profileInfo?.name || conn.targetAgentName || 'Unknown Agent'
    } (${conn.targetAccountId})\n`;
    const displayTopicId = conn.isPending
      ? '(Pending Request)'
      : conn.connectionTopicId;
    output += `   Topic: ${displayTopicId}\n`;
    let statusText = 'unknown';
    if (conn.isPending) {
      statusText = 'pending request (sent)';
    } else if (conn.needsConfirmation) {
      statusText = 'needs confirmation (received)';
    } else if (conn.status === 'established') {
      statusText = 'established';
    } else if (conn.status) {
      statusText = conn.status; // Fallback
    }
    output += `   Status: ${statusText}\n`;

    if (includeDetails) {
      if (conn.profileInfo?.bio) {
        output += `   Bio: ${conn.profileInfo.bio.substring(0, 100)}${
          conn.profileInfo.bio.length > 100 ? '...' : ''
        }\n`;
      }

      if (conn.created) {
        const createdLabel = conn.isPending
          ? 'Request sent'
          : 'Connection established';
        output += `   ${createdLabel}: ${conn.created.toLocaleString()}\n`;
      }

      if (conn.lastActivity) {
        output += `   Last activity: ${conn.lastActivity.toLocaleString()}\n`;
      }
    }

    return output;
  }

  private async enhanceConnectionInfo(
    connections: ActiveConnection[]
  ): Promise<ActiveConnection[]> {
    const finalConnections = new Map<string, ActiveConnection>();
    const profileMap = new Map<string, any>();
    const targetAccountIds = new Set<string>();

    for (const conn of connections) {
      if (conn.targetAccountId) {
        targetAccountIds.add(conn.targetAccountId);
      }
      // Add connection from state, assume established unless updated later
      finalConnections.set(conn.connectionTopicId, {
        ...conn,
        status: 'established',
        isPending: false,
        needsConfirmation: false,
      });
    }

    if (!this.hcsClient) {
      return Array.from(finalConnections.values());
    }

    let outboundMessages: HCSMessage[] = [];
    let inboundMessagesResult: { messages: HCSMessage[] } = { messages: [] };

    try {
      [outboundMessages, inboundMessagesResult] = await Promise.all([
        this.fetchOutboundMessages(),
        this.hcsClient
          .getInboundTopicId()
          .then((id) => this.hcsClient!.getMessages(id))
          .catch((_err) => ({ messages: [] })),
      ]);
    } catch (e) {
      // Silently ignore errors fetching initial messages
    }

    const inboundMessages = inboundMessagesResult.messages;

    const outboundRequestMap = new Map<number, HCSMessage>();
    const outboundConfirmationMap = new Map<number, HCSMessage>();
    const inboundRequestMap = new Map<number, HCSMessage>();
    const inboundConfirmationMap = new Map<number, HCSMessage>();

    for (const msg of outboundMessages) {
      if (msg.op === 'connection_request' && msg.connection_request_id) {
        outboundRequestMap.set(msg.connection_request_id, msg);
        const targetAcc =
          this.hcsClient.standardClient.extractAccountFromOperatorId(
            msg.operator_id || ''
          );
        if (targetAcc) {
          targetAccountIds.add(targetAcc);
        }
      }
      if (msg.op === 'connection_created' && msg.connection_request_id) {
        outboundConfirmationMap.set(msg.connection_request_id, msg);
        const targetAcc =
          this.hcsClient.standardClient.extractAccountFromOperatorId(
            msg.operator_id || ''
          );
        if (targetAcc) {
          targetAccountIds.add(targetAcc);
        }
      }
    }

    for (const msg of inboundMessages) {
      if (msg.op === 'connection_request' && msg.sequence_number) {
        inboundRequestMap.set(msg.sequence_number, msg);
        const requestorAcc =
          this.hcsClient.standardClient.extractAccountFromOperatorId(
            msg.operator_id || ''
          );
        if (requestorAcc) {
          targetAccountIds.add(requestorAcc);
        }
      }
      if (msg.op === 'connection_created' && msg.connection_id) {
        inboundConfirmationMap.set(msg.connection_id, msg);
        if (msg.connected_account_id) {
          targetAccountIds.add(msg.connected_account_id);
        }
      }
    }

    const profileFetchPromises = Array.from(targetAccountIds).map(
      async (accountId) => {
        try {
          const profileResult = await this.hcsClient!.getAgentProfile(
            accountId
          );
          if (profileResult.success && profileResult.profile) {
            profileMap.set(accountId, profileResult.profile);
          }
        } catch (e) {
          // Silently ignore profile fetch errors
        }
      }
    );
    await Promise.allSettled(profileFetchPromises);

    let activeAccountId: string | undefined;
    try {
      activeAccountId = this.hcsClient.getOperatorId();
    } catch (e) {
      // Silently ignore if we can't get the active ID
    }

    const getProfileInfo = (accountId?: string) => {
      if (!accountId) {
        return undefined;
      }
      const profile = profileMap.get(accountId);
      if (!profile) {
        return undefined;
      }
      return {
        name: profile.display_name || profile.alias,
        bio: profile.bio,
        avatar: profile.profileImage,
        type: profile.type,
        account_id: profile.account_id,
        profile_image_uri: profile.profile_image_uri,
      };
    };

    const requestTargetMap = new Map<number, string>();

    // First pass: Identify target for each request
    for (const [reqId, request] of outboundRequestMap.entries()) {
      let targetAccountIdForReq: string | undefined;
      try {
        if (request.payload) {
          const payloadData = JSON.parse(request.payload);
          targetAccountIdForReq = payloadData.target_account_id;
        }
      } catch {
        /* Ignore */
      }

      // If payload didn't provide it, try operator_id
      if (!targetAccountIdForReq || typeof targetAccountIdForReq !== 'string') {
        if (request.operator_id) {
          targetAccountIdForReq =
            this.hcsClient.standardClient.extractAccountFromOperatorId(
              request.operator_id
            );
        }
      }

      if (targetAccountIdForReq) {
        requestTargetMap.set(reqId, targetAccountIdForReq);
      }
    }

    // Second pass: Process confirmations and statuses
    for (const [reqId, request] of outboundRequestMap.entries()) {
      const originalSenderAccountId =
        this.hcsClient.standardClient.extractAccountFromOperatorId(
          request.operator_id || ''
        );
      const originalSenderProfileInfo = getProfileInfo(originalSenderAccountId);
      const originalSenderAgentName =
        originalSenderProfileInfo?.name ||
        `Agent ${originalSenderAccountId || 'Unknown'}`;

      const outboundConfirmation = outboundConfirmationMap.get(reqId);

      // 1. Check Local Confirmation First
      if (outboundConfirmation?.connection_topic_id) {
        const connectionTopicId = outboundConfirmation.connection_topic_id;
        const correctTargetAccountId = requestTargetMap.get(reqId);
        const correctTargetProfileInfo = getProfileInfo(correctTargetAccountId);
        const correctTargetAgentName =
          correctTargetProfileInfo?.name ||
          `Agent ${correctTargetAccountId || 'Unknown Target'}`;

        if (
          !finalConnections.has(connectionTopicId) ||
          finalConnections.get(connectionTopicId)?.isPending
        ) {
          finalConnections.set(connectionTopicId, {
            connectionTopicId,
            targetAccountId: correctTargetAccountId,
            targetAgentName: correctTargetAgentName,
            status: 'established',
            isPending: false,
            needsConfirmation: false,
            created: new Date(outboundConfirmation.created || request.created!),
            profileInfo: correctTargetProfileInfo,
            connection_request_id: reqId,
            confirmed_request_id: outboundConfirmation.confirmed_request_id,
            requestor_outbound_topic_id:
              outboundConfirmation.requestor_outbound_topic_id,
          });
        }
        const pendingKey = `pending_${reqId}`;
        if (finalConnections.has(pendingKey)) {
          finalConnections.delete(pendingKey);
        }
        continue;
      }

      // 2. If No Local Confirmation, Check Target's Topic
      let correctTargetInboundTopicId: string | undefined = undefined;
      let identifiedTargetAccountId: string | undefined = undefined;

      try {
        if (request.payload) {
          const payloadData = JSON.parse(request.payload);
          identifiedTargetAccountId = payloadData.target_account_id;
        }
        if (
          !identifiedTargetAccountId ||
          typeof identifiedTargetAccountId !== 'string'
        ) {
          if (activeAccountId && profileMap.size === 2) {
            const profileKeys = Array.from(profileMap.keys());
            identifiedTargetAccountId = profileKeys.find(
              (id) => id !== activeAccountId
            );
          }
        }
        if (identifiedTargetAccountId) {
          let targetProfile = profileMap.get(identifiedTargetAccountId);
          if (!targetProfile) {
            try {
              const profileResult = await this.hcsClient!.getAgentProfile(
                identifiedTargetAccountId
              );
              if (profileResult.success && profileResult.profile) {
                targetProfile = profileResult.profile;
                profileMap.set(identifiedTargetAccountId, targetProfile);
              }
            } catch (profileError) {
              // Silently ignore profile fetch error
            }
          }
          if (targetProfile?.inboundTopicId) {
            correctTargetInboundTopicId = targetProfile.inboundTopicId;
          }
        }
      } catch (error) {
        // Silently ignore payload parsing or fallback errors
      }

      // Step 2d: Fetch messages using the determined topic ID (WITH RETRIES)
      let targetConfirmation: HCSMessage | undefined = undefined;
      const MAX_FETCH_ATTEMPTS = 3;
      const FETCH_DELAY_MS = 500;

      if (correctTargetInboundTopicId) {
        for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
          try {
            const targetMessagesResult = await this.hcsClient.getMessages(
              correctTargetInboundTopicId
            );
            const targetMessages = targetMessagesResult.messages;
            targetConfirmation = targetMessages.find(
              (msg) =>
                msg.op === 'connection_created' && msg.connection_id === reqId
            );
            if (targetConfirmation) {
              break; // Found confirmation, exit retry loop
            } else if (attempt === MAX_FETCH_ATTEMPTS) {
              // If found nothing after max attempts, break normally
              break;
            }
          } catch (targetFetchError) {
            if (attempt === MAX_FETCH_ATTEMPTS) {
              // Error on last attempt, break loop
              break;
            } else {
              // Wait before retrying
              await new Promise((resolve) =>
                setTimeout(resolve, FETCH_DELAY_MS)
              );
            }
          }
        }
      }

      // 3. Process based on whether Target Confirmation was Found
      if (targetConfirmation?.connection_topic_id) {
        const connectionTopicId = targetConfirmation.connection_topic_id;
        const pendingKey = `pending_${reqId}`;
        const correctTargetProfileInfo = getProfileInfo(
          identifiedTargetAccountId
        );
        const correctTargetAgentName =
          correctTargetProfileInfo?.name ||
          `Agent ${identifiedTargetAccountId || 'Unknown'}`;

        if (
          !finalConnections.has(connectionTopicId) ||
          finalConnections.get(connectionTopicId)?.isPending
        ) {
          finalConnections.set(connectionTopicId, {
            connectionTopicId,
            targetAccountId: identifiedTargetAccountId,
            targetAgentName: correctTargetAgentName,
            status: 'established',
            isPending: false,
            needsConfirmation: false,
            created: new Date(targetConfirmation.created || request.created!),
            profileInfo: correctTargetProfileInfo,
            connection_request_id: reqId,
          });
        }
        if (finalConnections.has(pendingKey)) {
          finalConnections.delete(pendingKey);
        }
      } else {
        const pendingKey = `pending_${reqId}`;
        const alreadyEstablished = Array.from(finalConnections.values()).some(
          (c) => c.connection_request_id === reqId && c.status === 'established'
        );

        if (!alreadyEstablished && !finalConnections.has(pendingKey)) {
          finalConnections.set(pendingKey, {
            connectionTopicId: pendingKey,
            targetAccountId: originalSenderAccountId,
            targetAgentName: originalSenderAgentName,
            status: 'pending',
            isPending: true,
            needsConfirmation: false,
            created: new Date(request.created!),
            profileInfo: originalSenderProfileInfo,
            connection_request_id: reqId,
          });
        }
      }
    }

    // Process Inbound Requests (Sent to Us)
    for (const [reqSeqNum, request] of inboundRequestMap.entries()) {
      const requestorAccountId =
        this.hcsClient.standardClient.extractAccountFromOperatorId(
          request.operator_id || ''
        );
      const profileInfo = getProfileInfo(requestorAccountId);
      const requestorAgentName =
        profileInfo?.name || `Agent ${requestorAccountId || 'Unknown'}`;

      const inboundConfirmation = inboundConfirmationMap.get(reqSeqNum);

      if (!inboundConfirmation) {
        const needsConfirmKey = `needsConfirm_${reqSeqNum}`;
        const alreadyExists = Array.from(finalConnections.values()).some(
          (c) =>
            c.targetAccountId === requestorAccountId &&
            (c.status === 'established' || c.isPending)
        );
        if (!alreadyExists && !finalConnections.has(needsConfirmKey)) {
          finalConnections.set(needsConfirmKey, {
            connectionTopicId: needsConfirmKey,
            targetAccountId: requestorAccountId,
            targetAgentName: requestorAgentName,
            status: 'needs confirmation',
            isPending: false,
            needsConfirmation: true,
            created: new Date(request.created!),
            profileInfo: profileInfo,
            inbound_request_id: reqSeqNum,
          });
        }
      } else {
        const confirmedTopicId = inboundConfirmation.connection_topic_id!;
        if (!finalConnections.has(confirmedTopicId)) {
          // If locally confirmed but somehow missing, add it.
          finalConnections.set(confirmedTopicId, {
            connectionTopicId: confirmedTopicId,
            targetAccountId: requestorAccountId,
            targetAgentName: requestorAgentName,
            status: 'established',
            isPending: false,
            needsConfirmation: false,
            created: new Date(inboundConfirmation.created || request.created!),
            profileInfo: profileInfo,
            inbound_request_id: reqSeqNum,
          });
        }
      }
    }

    // Fetch Last Activity for Established Connections
    const activityFetchPromises = Array.from(finalConnections.values())
      .filter(
        (c) =>
          c.status === 'established' && !c.isPending && !c.needsConfirmation
      )
      .map(async (conn) => {
        try {
          const messagesResult = await this.hcsClient!.getMessages(
            conn.connectionTopicId
          );
          if (messagesResult?.messages?.length > 0) {
            const lastMessage = messagesResult.messages
              .filter((m) => m.created)
              .sort(
                (a, b) =>
                  new Date(b.created!).getTime() -
                  new Date(a.created!).getTime()
              )[0];
            if (lastMessage?.created) {
              const existingConn = finalConnections.get(conn.connectionTopicId);
              if (existingConn) {
                existingConn.lastActivity = new Date(lastMessage.created);
              }
            }
          }
        } catch (activityError) {
          // Silently ignore activity fetch errors
        }
      });
    await Promise.allSettled(activityFetchPromises);

    // --- UPDATE SHARED STATE ---
    for (const connection of finalConnections.values()) {
      this.stateManager.updateOrAddConnection(connection);
    }
    // ---------------------------

    // Return a fresh list from the *updated* state manager
    const updatedStateConnections = this.stateManager.listConnections();
    return updatedStateConnections;
  }

  private async fetchOutboundMessages(): Promise<HCSMessage[]> {
    if (!this.hcsClient) {
      return [];
    }

    try {
      const outboundTopicId = await this.hcsClient.getOutboundTopicId();
      if (!outboundTopicId) {
        return [];
      }
      const result = await this.hcsClient.getMessages(outboundTopicId);
      return result.messages || [];
    } catch (e) {
      return [];
    }
  }
}

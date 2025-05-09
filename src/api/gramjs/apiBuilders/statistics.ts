import { Api as GramJs } from '../../../lib/gramjs';

import type {
  ApiChannelMonetizationStatistics,
  ApiChannelStatistics,
  ApiGroupStatistics,
  ApiMessagePublicForward,
  ApiPostStatistics,
  ApiStoryPublicForward,
  ChannelMonetizationBalances,
  StatisticsGraph,
  StatisticsMessageInteractionCounter,
  StatisticsOverviewItem,
  StatisticsOverviewPercentage,
  StatisticsOverviewPeriod,
  StatisticsStoryInteractionCounter,
} from '../../types';

import { buildApiUsernames, buildAvatarPhotoId } from './common';
import { buildApiPeerId, getApiChatIdFromMtpPeer } from './peers';

const DECIMALS = 10 ** 9;

export function buildChannelStatistics(stats: GramJs.stats.BroadcastStats): ApiChannelStatistics {
  return {
    // Graphs
    growthGraph: buildGraph(stats.growthGraph),
    followersGraph: buildGraph(stats.followersGraph),
    muteGraph: buildGraph(stats.muteGraph),
    topHoursGraph: buildGraph(stats.topHoursGraph),

    // Async graphs
    languagesGraph: (stats.languagesGraph as GramJs.StatsGraphAsync).token,
    viewsBySourceGraph: (stats.viewsBySourceGraph as GramJs.StatsGraphAsync).token,
    newFollowersBySourceGraph: (stats.newFollowersBySourceGraph as GramJs.StatsGraphAsync).token,
    interactionsGraph: (stats.interactionsGraph as GramJs.StatsGraphAsync).token,
    reactionsByEmotionGraph: (stats.reactionsByEmotionGraph as GramJs.StatsGraphAsync).token,
    storyInteractionsGraph: (stats.storyInteractionsGraph as GramJs.StatsGraphAsync).token,
    storyReactionsByEmotionGraph: (stats.storyReactionsByEmotionGraph as GramJs.StatsGraphAsync).token,

    // Statistics overview
    followers: buildStatisticsOverview(stats.followers),
    viewsPerPost: buildStatisticsOverview(stats.viewsPerPost),
    sharesPerPost: buildStatisticsOverview(stats.sharesPerPost),
    enabledNotifications: buildStatisticsPercentage(stats.enabledNotifications),
    reactionsPerPost: buildStatisticsOverview(stats.reactionsPerPost),
    viewsPerStory: buildStatisticsOverview(stats.viewsPerStory),
    sharesPerStory: buildStatisticsOverview(stats.sharesPerStory),
    reactionsPerStory: buildStatisticsOverview(stats.reactionsPerStory),

    // Recent posts
    recentPosts: stats.recentPostsInteractions.map(buildApiPostInteractionCounter).filter(Boolean),
  };
}

export function buildChannelMonetizationStatistics(
  stats: GramJs.stats.BroadcastRevenueStats,
): ApiChannelMonetizationStatistics {
  return {
    // Graphs
    topHoursGraph: buildGraph(stats.topHoursGraph),
    revenueGraph: buildGraph(stats.revenueGraph, undefined, true, stats.usdRate),

    // Statistics overview
    balances: buildChannelMonetizationBalances(stats.balances),
    usdRate: stats.usdRate,
  };
}

export function buildApiPostInteractionCounter(
  interaction: GramJs.TypePostInteractionCounters,
): StatisticsMessageInteractionCounter | StatisticsStoryInteractionCounter | undefined {
  if (interaction instanceof GramJs.PostInteractionCountersMessage) {
    return {
      msgId: interaction.msgId,
      forwardsCount: interaction.forwards,
      viewsCount: interaction.views,
      reactionsCount: interaction.reactions,
    };
  }

  if (interaction instanceof GramJs.PostInteractionCountersStory) {
    return {
      storyId: interaction.storyId,
      reactionsCount: interaction.reactions,
      viewsCount: interaction.views,
      forwardsCount: interaction.forwards,
    };
  }

  return undefined;
}

export function buildGroupStatistics(stats: GramJs.stats.MegagroupStats): ApiGroupStatistics {
  return {
    // Graphs
    growthGraph: buildGraph(stats.growthGraph),
    membersGraph: buildGraph(stats.membersGraph),
    topHoursGraph: buildGraph(stats.topHoursGraph),

    // Async graphs
    languagesGraph: (stats.languagesGraph as GramJs.StatsGraphAsync).token,
    messagesGraph: (stats.messagesGraph as GramJs.StatsGraphAsync).token,
    actionsGraph: (stats.actionsGraph as GramJs.StatsGraphAsync).token,

    // Statistics overview
    period: getOverviewPeriod(stats.period),
    members: buildStatisticsOverview(stats.members),
    viewers: buildStatisticsOverview(stats.viewers),
    messages: buildStatisticsOverview(stats.messages),
    posters: buildStatisticsOverview(stats.posters),
  };
}

export function buildPostsStatistics(stats: GramJs.stats.MessageStats | GramJs.stats.StoryStats): ApiPostStatistics {
  return {
    viewsGraph: buildGraph(stats.viewsGraph),
    reactionsGraph: buildGraph(stats.reactionsByEmotionGraph),
  };
}

export function buildMessagePublicForwards(
  result: GramJs.stats.PublicForwards,
): ApiMessagePublicForward[] | undefined {
  if (!result) {
    return undefined;
  }

  return result.forwards.map((forward) => {
    if (forward instanceof GramJs.PublicForwardStory) return undefined;
    return buildApiMessagePublicForward(forward.message, result.chats);
  }).filter(Boolean);
}

export function buildStoryPublicForwards(
  result: GramJs.stats.PublicForwards,
): Array<ApiStoryPublicForward | ApiMessagePublicForward> | undefined {
  if (!result || !('forwards' in result)) {
    return undefined;
  }

  return result.forwards.map((forward) => {
    if (forward instanceof GramJs.PublicForwardMessage) {
      return buildApiMessagePublicForward(forward.message, result.chats);
    }

    const { peer, story } = forward;
    const peerId = getApiChatIdFromMtpPeer(peer);

    return {
      peerId,
      storyId: story.id,
      viewsCount: (story as GramJs.StoryItem).views?.viewsCount || 0,
      reactionsCount: (story as GramJs.StoryItem).views?.reactionsCount || 0,
    } as ApiStoryPublicForward;
  });
}

export function buildGraph(
  result: GramJs.TypeStatsGraph, isPercentage?: boolean, isCurrency?: boolean, currencyRate?: number,
): StatisticsGraph | undefined {
  if ((result as GramJs.StatsGraphError).error) {
    return undefined;
  }

  const data = JSON.parse((result as GramJs.StatsGraph).json.data);
  const [x, ...y] = data.columns;
  const hasSecondYAxis = data.y_scaled;

  return {
    type: isPercentage ? 'area' : data.types.y0,
    zoomToken: (result as GramJs.StatsGraph).zoomToken,
    labelFormatter: data.xTickFormatter,
    tooltipFormatter: data.xTooltipFormatter,
    labels: x.slice(1),
    hideCaption: !data.subchart.show,
    hasSecondYAxis,
    isStacked: data.stacked && !hasSecondYAxis,
    isPercentage,
    isCurrency,
    currencyRate,
    datasets: y.map((item: any) => {
      const key = item[0];

      return {
        name: data.names[key],
        color: extractColor(data.colors[key]),
        values: item.slice(1),
      };
    }),
    ...calculateMinimapRange(data.subchart.defaultZoom, x.slice(1)),
  };
}

function extractColor(color: string): string {
  return color.substring(color.indexOf('#'));
}

function calculateMinimapRange(range: Array<number>, values: Array<number>) {
  const [min, max] = range;

  let minIndex = 0;
  let maxIndex = values.length - 1;

  values.forEach((item, index) => {
    if (!minIndex && item >= min) {
      minIndex = index;
    }

    if (!maxIndex && item >= max) {
      maxIndex = index;
    }
  });

  const begin = Math.max(0, minIndex / (values.length - 1));
  const end = Math.min(1, maxIndex / (values.length - 1));

  return { minimapRange: { begin, end }, labelFromIndex: minIndex, labelToIndex: maxIndex };
}

function buildStatisticsOverview({ current, previous }: GramJs.StatsAbsValueAndPrev): StatisticsOverviewItem {
  const change = current - previous;

  return {
    current,
    change,
    percentage: (change ? ((Math.abs(change) / previous) * 100) : 0).toFixed(2),
  };
}

export function buildStatisticsPercentage(data: GramJs.StatsPercentValue): StatisticsOverviewPercentage {
  return {
    part: data.part,
    total: data.total,
    percentage: ((data.part / data.total) * 100).toFixed(2),
  };
}

function getOverviewPeriod(data: GramJs.StatsDateRangeDays): StatisticsOverviewPeriod {
  return {
    maxDate: data.maxDate,
    minDate: data.minDate,
  };
}

function buildApiMessagePublicForward(message: GramJs.TypeMessage, chats: GramJs.TypeChat[]): ApiMessagePublicForward {
  const peerId = getApiChatIdFromMtpPeer(message.peerId!);
  const channel = chats.find((c) => buildApiPeerId(c.id, 'channel') === peerId);
  const channelProfilePhoto = channel && 'photo' in channel && channel.photo instanceof GramJs.ChatPhoto
    ? channel.photo : undefined;

  return {
    messageId: message.id,
    views: (message as GramJs.Message).views,
    title: (channel as GramJs.Channel).title,
    chat: {
      id: peerId,
      type: 'chatTypeChannel',
      title: (channel as GramJs.Channel).title,
      usernames: buildApiUsernames(channel as GramJs.Channel),
      avatarPhotoId: channelProfilePhoto && buildAvatarPhotoId(channelProfilePhoto),
      hasVideoAvatar: Boolean(channelProfilePhoto?.hasVideo),
    },
  };
}

function buildChannelMonetizationBalances({
  currentBalance,
  availableBalance,
  overallRevenue,
  withdrawalEnabled,
}: GramJs.BroadcastRevenueBalances): ChannelMonetizationBalances {
  return {
    currentBalance: Number(currentBalance) / DECIMALS,
    availableBalance: Number(availableBalance) / DECIMALS,
    overallRevenue: Number(overallRevenue) / DECIMALS,
    isWithdrawalEnabled: withdrawalEnabled,
  };
}

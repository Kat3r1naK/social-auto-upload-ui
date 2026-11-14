import type { ContentKind, Platform } from '../sau_frontend/src/types/studio'
const logo = (name: string) => '/assets/platforms/' + name + '.png'
export const platforms: Platform[] = [
  {
    id: 'douyin',
    name: '抖音',
    logo: logo('douyin'),
    kinds: ['video', 'note'],
    schedule: true,
    legacyType: 3,
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    logo: logo('xiaohongshu'),
    kinds: ['video', 'note'],
    schedule: true,
    legacyType: 1,
  },
  {
    id: 'kuaishou',
    name: '快手',
    logo: logo('kuaishou'),
    kinds: ['video', 'note'],
    schedule: true,
    legacyType: 4,
  },
  {
    id: 'tencent',
    name: '视频号',
    logo: logo('shipinhao'),
    kinds: ['video'],
    schedule: true,
    legacyType: 2,
  },
  { id: 'bilibili', name: 'Bilibili', logo: logo('bilibili'), kinds: ['video'], schedule: true },
  { id: 'baijiahao', name: '百家号', logo: logo('baijiahao'), kinds: ['video'] },
  { id: 'dayu', name: '大鱼号', logo: logo('dayu'), kinds: ['video', 'article'], schedule: true },
  { id: 'alipay', name: '支付宝生活号', logo: logo('alipay'), kinds: ['video'] },
  { id: 'weibo', name: '微博', logo: logo('weibo'), kinds: ['video'] },
  { id: 'hupu', name: '虎扑', kinds: ['video'] },
  { id: 'xueqiu', name: '雪球', kinds: ['article'] },
  {
    id: 'zhihu',
    name: '知乎',
    logo: logo('zhihu'),
    kinds: ['video', 'article'],
    schedule: 'experimental',
  },
  { id: 'tiktok', name: 'TikTok', logo: logo('tiktok'), kinds: ['video'], schedule: true },
  { id: 'youtube', name: 'YouTube', logo: logo('youtube'), kinds: ['video'] },
  { id: 'facebook', name: 'Facebook', kinds: ['video', 'note'] },
  { id: 'facebook-page', name: 'Facebook Page', kinds: ['video', 'note'], schedule: true },
  { id: 'instagram', name: 'Instagram', kinds: ['video', 'note'] },
]
export const contentKinds: { id: ContentKind; label: string; icon: string }[] = [
  { id: 'video', label: '视频', icon: 'VideoCamera' },
  { id: 'note', label: '图文', icon: 'Picture' },
  { id: 'article', label: '文章', icon: 'Document' },
]
export const getPlatform = (id: string) => platforms.find((item) => item.id === id)
export const kindLabel = (id: string) => contentKinds.find((item) => item.id === id)?.label || id
export const mountainImage = '/assets/mountain-weekend.png'
export const creatorAvatar = '/assets/creator-avatar.png'
export function formatTime(value: string | number) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

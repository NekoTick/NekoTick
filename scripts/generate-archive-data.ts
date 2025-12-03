import { writeTextFile } from '@tauri-apps/plugin-fs';

const BASE_PATH = 'C:\\Users\\vladelaina\\Desktop\\NekoTick';
const ARCHIVE_PATH = `${BASE_PATH}\\archive`;

// 生成指定日期的归档内容
function generateArchiveContent(): string {
  let content = '';
  const now = new Date();
  
  // 生成过去120天的归档数据（约4个月）
  for (let i = 0; i < 120; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    const timestamp = date.toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    const completedTime = date.toLocaleString('zh-CN');
    const createdAt = date.getTime() - (Math.random() * 86400000 * 7); // 1-7天前创建，增加随机性
    
    // 每天2-12个任务，增加变化范围
    const taskCount = Math.floor(Math.random() * 11) + 2;
    
    content += `\n## 归档于 ${timestamp} [Count: ${taskCount}]\n\n`;
    
    const tasks = [
      '完成项目文档编写',
      '修复登录页面的bug',
      '优化数据库查询性能',
      '参加团队周会',
      '代码评审',
      '更新测试用例',
      '处理用户反馈',
      '编写API文档',
      '重构旧代码',
      '学习新技术栈',
      '准备技术分享',
      '优化前端性能',
      '数据库备份',
      '服务器维护',
      '编写单元测试',
      '设计系统架构',
      '需求分析',
      'UI界面调整',
      '集成第三方API',
      '部署到生产环境',
      '研究竞品功能',
      '编写周报',
      '处理紧急线上问题',
      '优化移动端适配',
      '添加埋点统计',
      '更新依赖包版本',
      '修复内存泄漏',
      '实现新需求功能',
      '进行压力测试',
      '配置CI/CD流程',
      '编写技术方案',
      '参加产品评审',
      '优化构建速度',
      '处理安全漏洞',
      '重构组件库',
      '添加国际化支持',
      '优化SEO设置',
      '编写E2E测试',
      '监控系统性能',
      '学习设计模式',
      '阅读技术文档',
      '整理知识笔记',
      '练习算法题',
      '观看技术视频',
      '参加线上课程',
      '复习数据结构',
      '学习开源项目',
      '编写博客文章',
      '参与社区讨论',
      '锻炼身体',
      '阅读书籍',
      '整理房间',
      '购买生活用品',
      '准备三餐',
      '休息放松',
      '家人聊天',
      '外出散步',
      '观看电影',
      '听音乐放松'
    ];
    
    const priorities = ['default', 'default', 'default', 'green', 'purple', 'yellow', 'red'];
    
    for (let j = 0; j < taskCount; j++) {
      const taskIndex = Math.floor(Math.random() * tasks.length);
      const taskName = tasks[taskIndex];
      
      // 更大范围的时间估算：5-240分钟
      const estimated = Math.floor(Math.random() * 235) + 5;
      
      // 实际时间：70%-150%的估算时间，增加随机性
      const variance = 0.7 + Math.random() * 0.8;
      const actual = Math.floor(estimated * variance);
      
      // 随机优先级
      const priority = priorities[Math.floor(Math.random() * priorities.length)];
      const priorityStr = priority !== 'default' ? ` [优先级: ${priority}]` : '';
      
      content += `- [x] ${taskName} [预估: ${estimated}m] [实际: ${actual}m] (完成于: ${completedTime}) (创建于: ${Math.floor(createdAt)})${priorityStr}\n`;
    }
  }
  
  return content;
}

// 为每个分组生成归档文件
async function generateArchiveFiles() {
  const groups = ['work', 'study', 'life'];
  
  for (const groupId of groups) {
    const content = generateArchiveContent();
    const filePath = `${ARCHIVE_PATH}\\${groupId}.md`;
    
    try {
      await writeTextFile(filePath, content);
      console.log(`✅ Generated archive for ${groupId}`);
    } catch (error) {
      console.error(`❌ Failed to generate archive for ${groupId}:`, error);
    }
  }
  
  console.log('\n🎉 All archive files generated!');
}

generateArchiveFiles();

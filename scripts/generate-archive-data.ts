import { writeTextFile } from '@tauri-apps/plugin-fs';

const BASE_PATH = 'C:\\Users\\vladelaina\\Desktop\\NekoTick';
const ARCHIVE_PATH = `${BASE_PATH}\\archive`;

// 生成指定日期的归档内容
function generateArchiveContent(): string {
  let content = '';
  const now = new Date();
  
  // 生成过去10天的归档数据
  for (let i = 0; i < 10; i++) {
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
    const createdAt = date.getTime() - (Math.random() * 86400000 * 3); // 1-3天前创建
    
    // 每天3-8个任务
    const taskCount = Math.floor(Math.random() * 6) + 3;
    
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
      '部署到生产环境'
    ];
    
    for (let j = 0; j < taskCount; j++) {
      const taskIndex = Math.floor(Math.random() * tasks.length);
      const taskName = tasks[taskIndex];
      const estimated = Math.floor(Math.random() * 120) + 15; // 15-135分钟
      const actual = Math.floor(estimated * (0.8 + Math.random() * 0.4)); // 80%-120%
      
      content += `- [x] ${taskName} [预估: ${estimated}m] [实际: ${actual}m] (完成于: ${completedTime}) (创建于: ${Math.floor(createdAt)})\n`;
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

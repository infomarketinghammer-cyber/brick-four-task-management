/**
 * Database client instantiation and in-memory store initialized with full BrickFour Employee Directory.
 */

import bcrypt from 'bcryptjs';
import { Role, User } from '../types';

export class PrismaClient {
  async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

export const prisma = new PrismaClient();

export interface RefreshTokenRecord {
  token: string;
  userId: string;
  familyId: string;
  isRevoked: boolean;
  createdAt: Date;
}

function makePasswordHash(name: string): string {
  const firstName = name.split(' ')[0].trim();
  const cap = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  return bcrypt.hashSync(`${cap}@123`, 8);
}

/**
 * In-Memory Database Store seeded with complete 27-member BrickFour organization directory.
 */
class InMemoryDatabase {
  public users: Map<string, User> = new Map();
  public resetTokens: Map<string, { userId: string; expiresAt: Date }> = new Map();
  public refreshTokens: Map<string, RefreshTokenRecord> = new Map();

  public revokeAllUserTokens(userId: string) {
    for (const [token, record] of this.refreshTokens.entries()) {
      if (record.userId === userId) {
        record.isRevoked = true;
      }
    }
  }

  public ensureSeeded() {
    if (this.users.size === 0) {
      this.seedInitialUsers();
    }
  }

  constructor() {
    this.seedInitialUsers();
  }

  private seedInitialUsers() {
    const rawEmployees: Array<{
      id: string;
      name: string;
      email: string;
      phone: string;
      employee_no: string;
      designation: string;
      department: string;
      location: string;
      date_of_joining: string;
      role: Role;
      hierarchy_level: number;
      manager_id: string | null;
    }> = [
      // Top Level: Director / CEO
      {
        id: 'usr-hemant-001',
        name: 'Hemant Sir',
        email: 'hemant@brickfour.com',
        phone: '9860090620',
        employee_no: 'BRKF001',
        designation: 'Director / CEO',
        department: 'Management',
        location: 'Yerwada',
        date_of_joining: '2008-01-01',
        role: 'ADMIN',
        hierarchy_level: 0,
        manager_id: null,
      },

      // Level 1: Direct Reports to Hemant Sir
      {
        id: 'usr-amol-004',
        name: 'Amol Umesh Biradar',
        email: 'amolbiradar218@gmail.com',
        phone: '7875737718',
        employee_no: 'BRKF004',
        designation: 'Site Engineer',
        department: 'Engineering',
        location: 'Satara',
        date_of_joining: '2019-09-19',
        role: 'DEPT_HEAD',
        hierarchy_level: 1,
        manager_id: 'usr-hemant-001',
      },
      {
        id: 'usr-charuta-011',
        name: 'Charuta Kulkarni',
        email: 'kulkarnicharuta1999@gmail.com',
        phone: '7057224055',
        employee_no: 'GPPL11',
        designation: 'Executive Assistant',
        department: 'HR & Admin',
        location: 'Yerwada',
        date_of_joining: '2026-04-08',
        role: 'DEPT_HEAD',
        hierarchy_level: 1,
        manager_id: 'usr-hemant-001',
      },
      {
        id: 'usr-dwarka-008',
        name: 'Dwarka Laxman Khandade',
        email: 'dwarka@brickfour.com',
        phone: '9604768530',
        employee_no: 'BRKF008',
        designation: 'Legal Head',
        department: 'Legal',
        location: 'Yerwada',
        date_of_joining: '2015-05-01',
        role: 'DEPT_HEAD',
        hierarchy_level: 1,
        manager_id: 'usr-hemant-001',
      },
      {
        id: 'usr-pramod-017',
        name: 'Pramod Chavan',
        email: 'pramod.chavan@brickfour.com',
        phone: '9930093099',
        employee_no: 'BRKF017',
        designation: 'Liasoning Head',
        department: 'Liasoning',
        location: 'Yerwada',
        date_of_joining: '2024-01-15',
        role: 'DEPT_HEAD',
        hierarchy_level: 1,
        manager_id: 'usr-hemant-001',
      },
      {
        id: 'usr-rahul-072',
        name: 'Rahul Gundappa Gaikwad',
        email: 'rahulgaikwad11111@gmail.com',
        phone: '9637675109',
        employee_no: 'BRKF072',
        designation: 'Land Acquisition Manager',
        department: 'Acquisition',
        location: 'Yerwada',
        date_of_joining: '2026-08-24',
        role: 'DEPT_HEAD',
        hierarchy_level: 1,
        manager_id: 'usr-hemant-001',
      },
      {
        id: 'usr-sanghshil-019',
        name: 'Sanghshil Ghatkamble',
        email: 'sanghshil@brickfour.com',
        phone: '9689423795',
        employee_no: 'BRKF019',
        designation: 'Sales Manager',
        department: 'Sales',
        location: 'Yerwada',
        date_of_joining: '2024-09-19',
        role: 'DEPT_HEAD',
        hierarchy_level: 1,
        manager_id: 'usr-hemant-001',
      },
      {
        id: 'usr-shailesh-020',
        name: 'Shailesh Kerkar',
        email: 'shailesh@brickfour.com',
        phone: '9763742430',
        employee_no: 'BRKF020',
        designation: 'General Manager',
        department: 'Management',
        location: 'Yerwada',
        date_of_joining: '2016-11-15',
        role: 'DEPT_HEAD',
        hierarchy_level: 1,
        manager_id: 'usr-hemant-001',
      },
      {
        id: 'usr-yash-067',
        name: 'Yash Balasaheb Sabale',
        email: 'techsupport@brickfour.com',
        phone: '8805565232',
        employee_no: 'BRKF067',
        designation: 'AI Automation & Solutions Engineer',
        department: 'AI Support',
        location: 'Yerwada',
        date_of_joining: '2026-06-17',
        role: 'DEPT_HEAD',
        hierarchy_level: 1,
        manager_id: 'usr-hemant-001',
      },
      {
        id: 'usr-santosh-cfo',
        name: 'Santosh kotgire',
        email: 's.kotgire@brickfour.com',
        phone: '9860090621',
        employee_no: 'BRKFCFO',
        designation: 'CFO',
        department: 'Finance and Accounting',
        location: 'Yerwada',
        date_of_joining: '2026-04-01',
        role: 'DEPT_HEAD',
        hierarchy_level: 1,
        manager_id: 'usr-hemant-001',
      },

      // Level 2: Subordinates under Dwarka Laxman Khandade
      {
        id: 'usr-archana-005',
        name: 'Archana Katkar',
        email: 'archana.katkar@brickfour.com',
        phone: '8975332899',
        employee_no: 'BRKF005',
        designation: 'Legal Executive',
        department: 'Legal',
        location: 'Yerwada',
        date_of_joining: '2022-11-14',
        role: 'EXECUTIVE',
        hierarchy_level: 2,
        manager_id: 'usr-dwarka-008',
      },
      {
        id: 'usr-balasaheb-006',
        name: 'Balasaheb Mundhe',
        email: 'greenoliasoning@gmail.com',
        phone: '9922937713',
        employee_no: 'BRKF006',
        designation: 'Liasoning Executive',
        department: 'Liasoning',
        location: 'Yerwada',
        date_of_joining: '2008-06-25',
        role: 'EXECUTIVE',
        hierarchy_level: 2,
        manager_id: 'usr-dwarka-008',
      },
      {
        id: 'usr-vikas-026',
        name: 'Vikas Khatik',
        email: 'vikas.khatik@brickfour.com',
        phone: '7972099968',
        employee_no: 'BRKF026',
        designation: 'Legal & Land Acquisition executive',
        department: 'Legal',
        location: 'Yerwada',
        date_of_joining: '2024-08-22',
        role: 'TEAM_LEAD',
        hierarchy_level: 2,
        manager_id: 'usr-dwarka-008',
      },
      // Level 3 under Vikas Khatik
      {
        id: 'usr-darshana-073',
        name: 'Darshana Uttam Ghodake',
        email: 'darshanaghodake4@gmail.com',
        phone: '9699958558',
        employee_no: 'BRKF073',
        designation: 'Telecalling Executive',
        department: 'Acquisition',
        location: 'Yerwada',
        date_of_joining: '2026-07-13',
        role: 'EXECUTIVE',
        hierarchy_level: 3,
        manager_id: 'usr-vikas-026',
      },

      // Level 2: Subordinates under Sanghshil Ghatkamble
      {
        id: 'usr-atul-060',
        name: 'Atul Bhardwaj',
        email: 'gbhardhwj@gmail.com',
        phone: '8518971856',
        employee_no: 'BRKF060',
        designation: 'Sales Manager',
        department: 'Sales',
        location: 'Yerwada',
        date_of_joining: '2026-06-10',
        role: 'EXECUTIVE',
        hierarchy_level: 2,
        manager_id: 'usr-sanghshil-019',
      },
      {
        id: 'usr-kapil-010',
        name: 'Kapil Anil Aru',
        email: 'kapil.aru@brickfour.com',
        phone: '9049977899',
        employee_no: 'BRKF010',
        designation: 'Sales Executive',
        department: 'Sales',
        location: 'Yerwada',
        date_of_joining: '2024-05-16',
        role: 'EXECUTIVE',
        hierarchy_level: 2,
        manager_id: 'usr-sanghshil-019',
      },
      {
        id: 'usr-nishant-070',
        name: 'Nishant Hemant Kale',
        email: 'marketintelligence@brickfour.com',
        phone: '7020584328',
        employee_no: 'BRKF070',
        designation: 'Market Intelligence Executive',
        department: 'Marketing',
        location: 'Yerwada',
        date_of_joining: '2026-08-04',
        role: 'EXECUTIVE',
        hierarchy_level: 2,
        manager_id: 'usr-sanghshil-019',
      },
      {
        id: 'usr-omkar-016',
        name: 'Omkar Sawant',
        email: 'omkarsawant36@gmail.com',
        phone: '9607688585',
        employee_no: 'BRKF016',
        designation: 'Sales Executive',
        department: 'Sales',
        location: 'Satara',
        date_of_joining: '2025-05-01',
        role: 'EXECUTIVE',
        hierarchy_level: 2,
        manager_id: 'usr-sanghshil-019',
      },
      {
        id: 'usr-sonal-023',
        name: 'Sonal Bhorkade',
        email: 'sonal.bhorkade2018@gmail.com',
        phone: '9373006671',
        employee_no: 'BRKF023',
        designation: 'Telecalling Executive',
        department: 'Sales',
        location: 'Yerwada',
        date_of_joining: '2025-08-18',
        role: 'TEAM_LEAD',
        hierarchy_level: 2,
        manager_id: 'usr-sanghshil-019',
      },
      // Level 3 under Sonal Bhorkade
      {
        id: 'usr-bhagyashree-074',
        name: 'Bhagyashree Patil',
        email: 'bp2664619@gmail.com',
        phone: '9373752741',
        employee_no: 'BRKF074',
        designation: 'Telecalling Executive',
        department: 'Sales',
        location: 'Yerwada',
        date_of_joining: '2026-08-19',
        role: 'EXECUTIVE',
        hierarchy_level: 3,
        manager_id: 'usr-sonal-023',
      },
      {
        id: 'usr-sachin-018',
        name: 'Sachin Bagkar',
        email: 'sachinbagkar22@gmail.com',
        phone: '7030655179',
        employee_no: 'BRKF018',
        designation: 'Sales Executive',
        department: 'Sales',
        location: 'Satara',
        date_of_joining: '2025-07-01',
        role: 'EXECUTIVE',
        hierarchy_level: 2,
        manager_id: 'usr-sanghshil-019',
      },

      // Level 2: Subordinates under Shailesh Kerkar
      {
        id: 'usr-ganesh-032',
        name: 'Ganesh Shivaji Veer',
        email: 'purchase@brickfour.com',
        phone: '9922093637',
        employee_no: 'BRKF032',
        designation: 'Purchase Executive',
        department: 'Purchase',
        location: 'Yerwada',
        date_of_joining: '2026-01-16',
        role: 'EXECUTIVE',
        hierarchy_level: 2,
        manager_id: 'usr-shailesh-020',
      },
      {
        id: 'usr-jyotsana-012',
        name: 'Jyotsana Nikum',
        email: 'hr@greenovation.co',
        phone: '9607999942',
        employee_no: 'GPPL12',
        designation: 'HR Executive',
        department: 'HR',
        location: 'Yerwada',
        date_of_joining: '2026-05-21',
        role: 'TEAM_LEAD',
        hierarchy_level: 2,
        manager_id: 'usr-shailesh-020',
      },
      // Level 3 under Jyotsana Nikum
      {
        id: 'usr-akshay-003',
        name: 'Akshay Sonawane',
        email: 'akshaysonawane2877@gmail.com',
        phone: '7038043606',
        employee_no: 'BRKF003',
        designation: 'Office Boy',
        department: 'Housekeeping',
        location: 'Yerwada',
        date_of_joining: '2012-02-01',
        role: 'EXECUTIVE',
        hierarchy_level: 3,
        manager_id: 'usr-jyotsana-012',
      },
      {
        id: 'usr-prajeet-033',
        name: 'Prajeet Patil',
        email: 'purchase.urbanedge@gmail.com',
        phone: '9604028885',
        employee_no: 'BRKF033',
        designation: 'Purchase Executive',
        department: 'Purchase',
        location: 'Yerwada',
        date_of_joining: '2026-05-04',
        role: 'EXECUTIVE',
        hierarchy_level: 2,
        manager_id: 'usr-shailesh-020',
      },

      // Level 2: Subordinates under Santosh kotgire
      {
        id: 'usr-suvidha-025',
        name: 'Suvidha Deshmukh',
        email: 'suvidha.deshmukh@brickfour.com',
        phone: '9834723551',
        employee_no: 'BRKF025',
        designation: 'Accounts Executive',
        department: 'Accounts',
        location: 'Yerwada',
        date_of_joining: '2024-07-23',
        role: 'EXECUTIVE',
        hierarchy_level: 2,
        manager_id: 'usr-santosh-cfo',
      },
      {
        id: 'usr-tayamma-068',
        name: 'Tayamma Bhandari',
        email: 'chaya.bhandari@brickfour.com',
        phone: '8605863940',
        employee_no: 'BRKF068',
        designation: 'Senior Accountant',
        department: 'Accounts',
        location: 'Yerwada',
        date_of_joining: '2026-06-18',
        role: 'EXECUTIVE',
        hierarchy_level: 2,
        manager_id: 'usr-santosh-cfo',
      },
    ];

    for (const emp of rawEmployees) {
      const u: User = {
        ...emp,
        password_hash: makePasswordHash(emp.name),
        is_active: true,
        last_login_at: new Date(),
        created_at: new Date(emp.date_of_joining),
        updated_at: new Date(),
      };
      this.users.set(u.id, u);
    }

    // Also support fallback legacy alias admin@company.com pointing to Hemant Sir
    const adminAlias: User = {
      id: 'usr-admin-001',
      name: 'Hemant Sir (Admin)',
      email: 'admin@company.com',
      password_hash: makePasswordHash('Hemant'),
      phone: '9860090620',
      employee_no: 'BRKF001',
      designation: 'Director / CEO',
      department: 'Management',
      location: 'Yerwada',
      date_of_joining: '2008-01-01',
      role: 'ADMIN',
      hierarchy_level: 0,
      manager_id: null,
      is_active: true,
      last_login_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.users.set(adminAlias.id, adminAlias);
  }
}

export const dbStore = new InMemoryDatabase();

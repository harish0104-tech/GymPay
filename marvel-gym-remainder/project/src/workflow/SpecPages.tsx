import GymPages,{type PageProps} from './GymPages';
import MemberPages from './MemberPages';
import PlatformPages from './PlatformPages';
export default function SpecPages(props:PageProps){return props.account.role==='super_admin'?<PlatformPages {...props}/>:props.account.role==='member'?<MemberPages {...props}/>:<GymPages {...props}/>;}

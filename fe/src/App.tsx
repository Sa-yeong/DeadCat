import './App.css'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import Root from './layout/Root';
import { LoginPage } from './page/LoginPage';
import { SignUp } from './common/Signup';
import { MyPageLayout } from './layout/MyPageLayout';
import { StockListView } from './page/stockListPage/StockListView';
import { StockList } from './page/stockListPage/StockList';
import { CategoryList } from './page/stockListPage/CategoryList';
import { Tab1 } from './page/mypage/Tab1';
import { Tab2 } from './page/mypage/Tab2';
import { Tab3 } from './page/mypage/Tab3';
// import { MyStockList } from './page/mypage/MyStockList';
// import { ChangeProfile } from './page/mypage/ChangeProile';
import { WritePosts } from './page/mypage/WritePosts';
import { WriteComments } from './page/mypage/WriteComments';
import { LikePost } from './page/mypage/LikePost';
import { IndividualStockView } from './page/stockPage/IndividualStockView';
import { StockChart } from './page/stockPage/StockChart';
import { CorporInfo } from './page/stockPage/CorporInfo';
import { Community } from './page/stockPage/Community';
import { FollowList } from './page/mypage/FollowList';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      {index: true, element: <Navigate to='/stocks' replace />},
      {path: 'stocks', element: <StockListView />, children: [
        {index: true, element: <Navigate to='basic-list' replace />},
        {path:'basic-list', element:<StockList />},
        {path:'category', element: <CategoryList />}
      ]},
      {path: 'stocks/individual/:stock_code', element: <IndividualStockView />, children: [
        {index: true, element: <Navigate to='chart' replace />},
        {path: 'chart', element: <StockChart />},
        {path: 'corpor_info', element: <CorporInfo />},
        {path: 'community', element: <Community />}
      ]},
      {path: 'mypage', element: <MyPageLayout />, children: [
        {index: true, element: <Navigate to='assets' replace />},
        {path: 'assets', element: <Tab1 />, children:[
          // {index:true, element: <FollowList />},
          {path: 'follow', element: <FollowList />}
          // {index:true, element: <MyStockList />},
          // {path: 'list', element: <MyStockList />},
          // {path: 'profile', element: <ChangeProfile />}

        ]},
        {path: 'history', element: <Tab2 />},
        {path: 'community', element: <Tab3 />, children: [
        {index:true, element:<Navigate to='written-posts' replace />},
          {path: 'written-posts', element: <WritePosts />},
          {path: 'written-comments', element: <WriteComments />},
          {path: 'liked-posts', element: <LikePost />}
        ]}
      ]},
      // {path: 'mypage/community/myPosts', element: <MyPost />},
      // {path: 'mypage/community/myComments', element: <MyComment />},
      // {path: 'mypage/community/likes', element: <LikePost />}
    ]
  },
  {path: 'login', element: <LoginPage />},
  {path: 'signup', element: <SignUp />}
])

function App() {

  return <div className='app-container'>
    <RouterProvider router={router} />
  </div>;
}

export default App

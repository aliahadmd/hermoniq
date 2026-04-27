import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useTheme } from '@react-navigation/native';
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/lib/auth-client';
import { useMoneyReminderSync } from '@/hooks/use-money-reminder-sync';
import AccountsScreen from './accounts';
import TransactionsScreen from './transactions';
import BudgetsScreen from './budgets';
import DashboardScreen from './dashboard';

const TopTabs = createMaterialTopTabNavigator();

export default function MoneyTrackerLayout() {
  const { colors } = useTheme();
  const { data: session, isPending } = useSession();

  useMoneyReminderSync(Boolean(session));

  if (isPending) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <TopTabs.Navigator
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.text,
          tabBarScrollEnabled: true,
          tabBarStyle: {
            backgroundColor: colors.card,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          },
          tabBarItemStyle: {
            width: 'auto',
          },
          tabBarContentContainerStyle: {
            paddingHorizontal: 8,
          },
          tabBarIndicatorStyle: {
            backgroundColor: colors.primary,
          },
          tabBarLabelStyle: {
            fontWeight: '600',
            fontSize: 13,
            textTransform: 'none',
          },
        }}>
        <TopTabs.Screen name="accounts" component={AccountsScreen} options={{ title: 'Accounts' }} />
        <TopTabs.Screen name="transactions" component={TransactionsScreen} options={{ title: 'Transactions' }} />
        <TopTabs.Screen name="budgets" component={BudgetsScreen} options={{ title: 'Budget' }} />
        <TopTabs.Screen name="dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      </TopTabs.Navigator>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
